import { chromium, Browser, BrowserContext, Page } from "playwright";
import dns from "node:dns/promises";
import net from "node:net";
import type {
  CaptureRequest,
  CaptureResponse,
  NetworkLog,
  CookieData,
  StorageData,
  JsError,
  JsBundle,
  SourceMap,
} from "./schemas";

const MAX_BODY_SIZE = 500_000;
const NAVIGATION_TIMEOUT = 30_000;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const DNS_TIMEOUT_MS = 10_000;
const EVALUATE_TIMEOUT_MS = 10_000;

const logger = {
  warn: (msg: string, ...args: unknown[]) => console.warn(`[playwright] ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) => console.debug(`[playwright] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[playwright] ${msg}`, ...args),
};

export function truncateBody(body: string): string {
  if (body.length > MAX_BODY_SIZE) {
    return body.slice(0, MAX_BODY_SIZE) + "\n<!-- truncated -->";
  }
  return body;
}

export function isPrivateIPv4(ip: string): boolean {
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

export function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:");
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
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
      out[key] = "[REDACTED]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

export class PlaywrightService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async ensureBrowser(): Promise<BrowserContext> {
    if (this.context) return this.context;
    this.browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
    });
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.context = null;
    this.browser = null;
  }

  private async resolveWithTimeout(host: string): Promise<{ address: string; family: number }[]> {
    const result = await Promise.race([
      dns.lookup(host, { all: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`DNS lookup timed out for ${host}`)), DNS_TIMEOUT_MS)
      ),
    ]);
    return result as { address: string; family: number }[];
  }

  private async assertCaptureAllowed(req: CaptureRequest): Promise<void> {
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
      ? [{ address: host, family: directIpVersion as 4 | 6 }]
      : await this.resolveWithTimeout(host);
    for (const addr of addresses) {
      if (addr.family === 4 && isPrivateIPv4(addr.address)) {
        throw new Error("target_url resolves to private IPv4 address");
      }
      if (addr.family === 6 && isPrivateIPv6(addr.address)) {
        throw new Error("target_url resolves to private IPv6 address");
      }
    }
  }

  private ensureUrlScheme(url: string): string {
    if (!/^https?:\/\//i.test(url)) {
      return `https://${url}`;
    }
    return url;
  }

  async capture(req: CaptureRequest): Promise<CaptureResponse> {
    req.target_url = this.ensureUrlScheme(req.target_url);
    await this.assertCaptureAllowed(req);

    const startTime = Date.now();
    const context = await this.ensureBrowser();
    const page: Page = await context.newPage();

    try {

    const networkLogs: NetworkLog[] = [];
    const pendingLogs = new Map<string, NetworkLog>();
    const jsBundles: JsBundle[] = [];
    const sourceMaps: SourceMap[] = [];
    const jsErrors: JsError[] = [];
    const seenUrls = new Set<string>();

    page.on("request", (request) => {
      const url = request.url();
      if (seenUrls.has(url)) return;
      seenUrls.add(url);
      const entry: NetworkLog = {
        url,
        method: request.method(),
        status: 0,
        request_headers: redactHeaders(
          Object.fromEntries(Object.entries(request.headers()))
        ),
        response_headers: {},
        timestamp: new Date().toISOString(),
      };
      pendingLogs.set(url, entry);
      networkLogs.push(entry);
    });

    page.on("response", (response) => {
      try {
        const url = response.url();
        const existing = pendingLogs.get(url);
        if (existing) {
          existing.status = response.status();
          existing.response_headers = redactHeaders(
            Object.fromEntries(Object.entries(response.headers()))
          );
          pendingLogs.delete(url);
        }

        const contentType = response.headers()["content-type"] || "";
        if (contentType.includes("javascript") || url.match(/\.(js|mjs)\b/i)) {
          response.body().then((body) => {
            try {
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
              logger.debug("could not process JS body for %s", url);
            }
          }).catch(() => {
            logger.debug("could not read response body for %s", url);
          });
        }
      } catch (err) {
        logger.warn("response handler error: %s", String(err));
      }
    });

    page.on("pageerror", (err) => {
      jsErrors.push({
        message: err.message,
        source: err.stack?.split("\n")[0] || "unknown",
        lineno: 0,
        colno: 0,
        stack: err.stack,
      });
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const location = msg.location();
        jsErrors.push({
          message: msg.text(),
          source: location.url,
          lineno: location.lineNumber,
          colno: location.columnNumber,
        });
      }
    });

    try {
      await page.goto(req.target_url, {
        waitUntil: "networkidle",
        timeout: NAVIGATION_TIMEOUT,
      });
    } catch (err) {
      logger.warn("page.goto incomplete (networkidle may not have fired): %s", String(err));
    }

    if (req.wait_for) {
      try {
        await page.waitForSelector(req.wait_for, { timeout: 5000 });
      } catch (err) {
        logger.debug("waitForSelector skipped (%s): %s", req.wait_for, String(err));
      }
    }

    let renderedHtml = "";
    try {
      renderedHtml = await page.content();
    } catch (err) {
      logger.debug("page.content failed: %s", String(err));
    }

    let cookiesSet: CookieData[] = [];
    try {
      const cdpCookies = await context.cookies();
      cookiesSet = cdpCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite || "Lax",
      }));
    } catch (err) {
      logger.debug("cookie extraction failed: %s", String(err));
    }

    let localStorageData: StorageData[] = [];
    let sessionStorageData: StorageData[] = [];
    try {
      const origins = await page.evaluate(() =>
        Array.from(new Set(
          Array.from(document.querySelectorAll("iframe, frame")).map(
            (f) => (f as HTMLIFrameElement).src
          )
        )).filter(Boolean)
      );
      const origin = new URL(req.target_url).origin;
      origins.unshift(origin);

      const unique = Array.from(new Set(origins));
      type StorageResult = { origin: string; localStorage: Record<string, string>; sessionStorage: Record<string, string> };
      const storageResults = await (page.evaluate as any)(
        (origins: string[]) => {
          return origins.map((o) => {
            const ls: Record<string, string> = {};
            const ss: Record<string, string> = {};
            try {
              if (o === location.origin) {
                for (let i = 0; i < window.localStorage.length; i++) {
                  const k = window.localStorage.key(i);
                  if (k) ls[k] = window.localStorage.getItem(k) || "";
                }
                for (let i = 0; i < window.sessionStorage.length; i++) {
                  const k = window.sessionStorage.key(i);
                  if (k) ss[k] = window.sessionStorage.getItem(k) || "";
                }
              }
            } catch {
              // cross-origin storage not accessible
            }
            return { origin: o, localStorage: ls, sessionStorage: ss };
          });
        },
        unique,
        { timeout: EVALUATE_TIMEOUT_MS }
      );
      localStorageData = storageResults.map((r: StorageResult) => ({ origin: r.origin, localStorage: r.localStorage, sessionStorage: {} }));
      sessionStorageData = storageResults.map((r: StorageResult) => ({ origin: r.origin, localStorage: {}, sessionStorage: r.sessionStorage }));
    } catch (err) {
      logger.debug("storage extraction failed: %s", String(err));
    }

    let screenshotBase64: string | undefined;
    if (req.capture_screenshot) {
      try {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        screenshotBase64 = screenshotBuffer.toString("base64");
      } catch (err) {
        logger.debug("screenshot failed: %s", String(err));
      }
    }

    try {
      const pageScripts = await page.$$eval("script[src]", (scripts: HTMLScriptElement[]) =>
        scripts.map((s) => s.src).filter(Boolean)
      );

      for (const src of pageScripts) {
        if (seenUrls.has(src)) continue;
        seenUrls.add(src);
        try {
          const resp = await (page.evaluate as any)(
            async (url: string) => {
              const r = await fetch(url);
              return r.ok ? await r.text() : null;
            },
            src,
            { timeout: EVALUATE_TIMEOUT_MS }
          );
          if (resp) {
            jsBundles.push({ url: src, content: truncateBody(resp) });
            const smMatch = resp.match(/\/\/# sourceMappingURL=(.+\.map)\b/);
            if (smMatch) {
              const sourceMapUrl = new URL(smMatch[1], src).href;
              sourceMaps.push({ url: src, source_map_url: sourceMapUrl });
            }
          }
        } catch {
          logger.debug("failed to fetch script bundle: %s", src);
        }
      }
    } catch (err) {
      logger.debug("script[src] extraction failed: %s", String(err));
    }

    try {
      const inlineScripts = await page.$$eval(
        "script:not([src])",
        (scripts: HTMLScriptElement[]) =>
          scripts.map((s) => s.textContent || "").filter(Boolean)
      );
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
    } catch (err) {
      logger.debug("inline script extraction failed: %s", String(err));
    }

    const executionTimeMs = Date.now() - startTime;

    const response: CaptureResponse = {
      target_url: req.target_url,
      captured_at: new Date().toISOString(),
      rendered_html: renderedHtml,
      network_logs: networkLogs,
      cookies_set: cookiesSet,
      local_storage: localStorageData,
      session_storage: sessionStorageData,
      javascript_errors: jsErrors,
      execution_time_ms: executionTimeMs,
      screenshot_base64: screenshotBase64,
      js_bundles: jsBundles,
      source_maps: sourceMaps,
    };

    return response;
    } finally {
      await page.close().catch((err) => logger.warn("page.close failed: %s", String(err)));
    }
  }

  async captureSafe(req: CaptureRequest): Promise<CaptureResponse> {
    try {
      return await this.capture(req);
    } catch (err) {
      logger.warn("capture failed for %s: %s", req.target_url, String(err));
      return {
        target_url: req.target_url,
        captured_at: new Date().toISOString(),
        rendered_html: "",
        network_logs: [],
        cookies_set: [],
        local_storage: [],
        session_storage: [],
        javascript_errors: [],
        execution_time_ms: 0,
        js_bundles: [],
        source_maps: [],
        note: `capture failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
