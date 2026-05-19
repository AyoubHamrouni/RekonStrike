import { chromium, Page } from "playwright";
import dns from "node:dns/promises";
import net from "node:net";

export interface CaptureRequest {
  target_url: string;
  auth_config?: Record<string, unknown>;
  max_steps?: number;
  scope?: string[];
}

export interface CapturedRequest {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  body_preview?: string;
}

export interface JsBundle {
  url: string;
  content: string;
}

export interface SourceMap {
  url: string;
  source_map_url: string;
}

export interface CaptureResult {
  target_url: string;
  captured_at: string;
  raw_traffic: CapturedRequest[];
  js_bundles: JsBundle[];
  source_maps: SourceMap[];
  screenshot_base64?: string;
  note?: string;
}

const MAX_BODY_SIZE = 500_000;
const NAVIGATION_TIMEOUT = 30_000;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

function truncateBody(body: string): string {
  if (body.length > MAX_BODY_SIZE) {
    return body.slice(0, MAX_BODY_SIZE) + "\n<!-- truncated -->";
  }
  return body;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:");
}

async function assertCaptureAllowed(req: CaptureRequest): Promise<void> {
  const parsed = new URL(req.target_url);
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new Error("unsupported target_url scheme");
  }
  const host = parsed.hostname.toLowerCase();
  if (req.scope?.length) {
    const allowed = req.scope.some((rule) => {
      const r = rule.toLowerCase().replace(/^\*\./, "");
      return host === r || host.endsWith(`.${r}`);
    });
    if (!allowed) throw new Error("target_url is outside provided scope");
  }

  const directIpVersion = net.isIP(host);
  const addresses = directIpVersion
    ? [{ address: host, family: directIpVersion }]
    : await dns.lookup(host, { all: true });
  for (const addr of addresses) {
    if (addr.family === 4 && isPrivateIPv4(addr.address)) {
      throw new Error("target_url resolves to private IPv4 address");
    }
    if (addr.family === 6 && isPrivateIPv6(addr.address)) {
      throw new Error("target_url resolves to private IPv6 address");
    }
  }
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const k = key.toLowerCase();
    if (
      k === "authorization" ||
      k === "cookie" ||
      k === "set-cookie" ||
      k === "proxy-authorization" ||
      k === "x-api-key" ||
      k.startsWith("x-auth-") ||
      k.includes("token") ||
      k.includes("secret") ||
      k.includes("key")
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function captureSite(req: CaptureRequest): Promise<CaptureResult> {
  await assertCaptureAllowed(req);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "en-US",
  });

  const page: Page = await context.newPage();
  const rawTraffic: CapturedRequest[] = [];
  const jsBundles: JsBundle[] = [];
  const sourceMaps: SourceMap[] = [];
  const seenUrls = new Set<string>();

  page.on("request", (request) => {
    const url = request.url();
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    rawTraffic.push({
      url,
      method: request.method(),
      status: 0,
      headers: redactHeaders(Object.fromEntries(Object.entries(request.headers()))),
    });
  });

  page.on("response", async (response) => {
    const url = response.url();
    const existing = rawTraffic.find((r) => r.url === url && r.status === 0);
    if (existing) {
      existing.status = response.status();
      existing.headers = redactHeaders(Object.fromEntries(Object.entries(response.headers())));
    }

    const contentType = response.headers()["content-type"] || "";
    if (contentType.includes("javascript") || url.match(/\.(js|mjs)\b/i)) {
      try {
        const body = await response.body();
        const content = body.toString("utf-8");
        jsBundles.push({ url, content: truncateBody(content) });

        const smMatch = content.match(
          /\/\/# sourceMappingURL=(.+\.map)\b/
        );
        if (smMatch) {
          const sourceMapUrl = new URL(smMatch[1], url).href;
          sourceMaps.push({ url, source_map_url: sourceMapUrl });
        }
      } catch {
        // skip bodies that can't be read
      }
    }
  });

  try {
    await page.goto(req.target_url, {
      waitUntil: "networkidle",
      timeout: NAVIGATION_TIMEOUT,
    });
  } catch {
    // networkidle may not fire on all pages; continue with what we have
  }

  let screenshotBase64: string | undefined;
  try {
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    screenshotBase64 = screenshotBuffer.toString("base64");
  } catch {
    // screenshot may fail
  }

  const pageScripts = await page.$$eval("script[src]", (scripts: HTMLScriptElement[]) =>
    scripts.map((s) => s.src).filter(Boolean)
  );

  for (const src of pageScripts) {
    if (seenUrls.has(src)) continue;
    seenUrls.add(src);
    try {
      const resp = await page.evaluate(async (url: string) => {
        const r = await fetch(url);
        return r.ok ? await r.text() : null;
      }, src);
      if (resp) {
        jsBundles.push({ url: src, content: truncateBody(resp) });
        const smMatch = resp.match(/\/\/# sourceMappingURL=(.+\.map)\b/);
        if (smMatch) {
          const sourceMapUrl = new URL(smMatch[1], src).href;
          sourceMaps.push({ url: src, source_map_url: sourceMapUrl });
        }
      }
    } catch {
      // skip failed fetches
    }
  }

  let inlineScripts: string[] = [];
  try {
    inlineScripts = await page.$$eval(
      "script:not([src])",
      (scripts: HTMLScriptElement[]) =>
        scripts.map((s) => s.textContent || "").filter(Boolean)
    );
  } catch {
    // inline script extraction may fail on some pages
  }

  for (let i = 0; i < inlineScripts.length; i++) {
    const content = inlineScripts[i];
    jsBundles.push({
      url: `${req.target_url}#inline-${i}`,
      content: truncateBody(content),
    });
    const smMatch = content.match(/\/\/# sourceMappingURL=(.+\.map)\b/);
    if (smMatch) {
      const sourceMapUrl = new URL(smMatch[1], req.target_url).href;
      sourceMaps.push({
        url: `${req.target_url}#inline-${i}`,
        source_map_url: sourceMapUrl,
      });
    }
  }

  await browser.close();

  return {
    target_url: req.target_url,
    captured_at: new Date().toISOString(),
    raw_traffic: rawTraffic,
    js_bundles: jsBundles,
    source_maps: sourceMaps,
    screenshot_base64: screenshotBase64,
  };
}

export async function captureSiteSafe(
  req: CaptureRequest
): Promise<CaptureResult> {
  try {
    return await captureSite(req);
  } catch (err) {
    return {
      target_url: req.target_url,
      captured_at: new Date().toISOString(),
      raw_traffic: [],
      js_bundles: [],
      source_maps: [],
      note: `capture failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
