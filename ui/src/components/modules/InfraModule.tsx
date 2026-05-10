import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, XCircle, BookOpen, Beaker, Sparkles, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { fetchEndpoints, fetchLiveHosts, aiAdvisor } from "../../api";
import PayloadLibrary from "../PayloadLibrary";

interface TestState {
  done?: boolean;
  vulnerable?: boolean;
}

interface FindingForm {
  url: string;
  request: string;
  response: string;
  steps: string;
  impact: string;
  severity: string;
  title: string;
}

interface DiscoverResult {
  fileParams: boolean;
  proxyParams: boolean;
  cloudUrls: boolean;
  adminPanels: boolean;
  uploadEndpoints: boolean;
  apiEndpoints: boolean;
}

interface AiSuggestion {
  test: string;
  reason: string;
  specific_url?: string;
  payload_hint?: string;
}

interface InfraModuleProps {
  host: string;
  targetId: number;
}

const lessons = {
  what: "Infrastructure misconfigurations are flaws in how the application is deployed and configured rather than in the application code itself. These include exposed cloud storage, open admin panels, misconfigured CORS, weak TLS, debug endpoints left enabled, and path traversal via file-serving endpoints.",
  why: "Infrastructure bugs can have massive scale. Exposed S3 buckets leaked data from the NSA, Verizon, and Accenture. A misconfigured CORS policy on Facebook earned $12,500. Debug endpoints on Tesla's API exposed internal infrastructure. Cloud metadata SSRF can compromise an entire AWS account.",
  indicators: [
    "Server response headers revealing software versions",
    "Cloud storage URLs in JavaScript files (s3.amazonaws.com, storage.googleapis.com)",
    ".git or .env files accessible in the web root",
    "CORS headers allowing any origin (Access-Control-Allow-Origin: *)",
    "Admin panels accessible without authentication",
    "File-serving endpoints (download.php, getFile, /static/)",
  ],
  mistakes: [
    "Only testing the main domain — staging, dev, and admin subdomains are more vulnerable",
    "Assuming cloud storage is private by default — it is NOT",
    "Not checking for directory listing on discovered paths",
    "Forgetting to test subdomain-specific SSRF via Host header",
  ],
};

const testItems = [
  { key: "ssrf_internal", title: "SSRF — Internal Services", severity: "critical",
    payloadCategory: "ssrf_internal",
    instructions: "Target: {host}\nTest for SSRF by supplying URLs that the server will fetch:\n- ?url=http://127.0.0.1:80\n- ?url=http://127.0.0.1:8080\n- ?url=http://[::1]:80\n- ?url=http://0.0.0.0:22\n\nOpen the payload library for 10 internal SSRF payloads with localhost, IPv6, decimal, octal, hex, and shorthand encodings." },
  { key: "ssrf_cloud", title: "SSRF — Cloud Metadata", severity: "critical",
    payloadCategory: "ssrf_cloud",
    instructions: "Target: {host}\nIf the app makes requests to user-controlled URLs, target cloud metadata:\n- http://169.254.169.254/latest/meta-data/ (AWS)\n- http://metadata.google.internal/computeMetadata/v1/ (GCP)\n- http://169.254.169.254/metadata/instance?api-version=2021-02-01 (Azure)\n\nOpen the payload library for 8 cloud metadata SSRF payloads covering AWS, Azure, and GCP." },
  { key: "xxe", title: "XXE (XML External Entities)", severity: "critical",
    payloadCategory: "xxe",
    instructions: "Target: {host}\nIf the endpoint accepts XML, test for XXE:\n<?xml version=\"1.0\"?>\n<!DOCTYPE foo [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>\n<root>&xxe;</root>\n\nOpen the payload library for 8 XXE payloads covering file read, SSRF, blind OOB, and PHP expect RCE." },
  { key: "csrf", title: "CSRF Token Validation", severity: "high",
    instructions: "Target: {host}\nTest for CSRF token absence in state-changing requests:\n1. Capture a POST/PUT/DELETE request that modifies data\n2. Remove the CSRF token from the request body\n3. Remove the CSRF token from headers (X-CSRF-Token, X-XSRF-Token)\n4. Replay the request — if it succeeds, CSRF protection is missing\n\nAlso test: change Referer header to a different origin." },
  { key: "open_redirect", title: "Open Redirect Chaining", severity: "medium",
    payloadCategory: "open_redirect",
    instructions: "Target: {host}\nTest redirect parameters for open redirects:\n- ?redirect=https://evil.com\n- ?url=//evil.com\n- ?next=@evil.com\n- ?returnUrl=///evil.com\n\nOpen the payload library for 8 open redirect payloads with absolute, protocol-relative, chained, subdomain confusion, and triple-slash variants." },
  { key: "path_traversal", title: "Path Traversal", severity: "high",
    payloadCategory: "path_traversal",
    instructions: "Target: {host}\nTest file-serving parameters:\n- ?file=../../../etc/passwd\n- ?page=....//....//....//etc/passwd\n- ?template=%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd\n\nOpen the payload library for 10 path traversal payloads with basic, double-dot, URL-encoded, double-URL-encoded, null byte, and backslash variants." },
  { key: "file_upload", title: "File Upload Bypass", severity: "high",
    instructions: "Target: {host}\nTest file upload functionality:\n1. Content-Type bypass: Change Content-Type to image/png\n2. Extension bypass: shell.php.jpg, shell.php%00.jpg\n3. Double extension: shell.php.png\n4. Try uploading .htaccess files to override MIME handling\n5. Try .svg with embedded XSS:\n   <svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>" },
  { key: "cors", title: "CORS Misconfiguration", severity: "medium",
    instructions: "Target: {host}\ncurl -H 'Origin: https://evil.com' -I {host}/api/endpoint\ncurl -H 'Origin: null' -I {host}/api/endpoint\ncurl -H 'Origin: https://{host}.evil.com' -I {host}/api/endpoint\n\nLook for:\n- Access-Control-Allow-Origin: * (dangerous)\n- Access-Control-Allow-Origin: https://evil.com (reflects any origin)\n- Access-Control-Allow-Origin: null (bypassable)\n- Access-Control-Allow-Credentials: true with arbitrary origin" },
  { key: "clickjacking", title: "Clickjacking (X-Frame-Options)", severity: "medium",
    instructions: "Target: {host}\ncurl -I {host} | grep -i X-Frame-Options\n\nIf X-Frame-Options is missing and CSP does not have frame-ancestors, the site is vulnerable to clickjacking.\n\nTest by creating an HTML page:\n<html><body><iframe src=\"{host}\" width=\"800\" height=\"600\"></iframe></body></html>\n\nIf the page loads in the iframe, it's vulnerable." },
  { key: "host_header_ssrf", title: "Subdomain SSRF via Host Header", severity: "high",
    instructions: "Target: {host}\nTest Host header manipulation for SSRF:\n1. Capture a request that generates links (password reset, notification)\n2. Change the Host header to attacker.com\n   curl -H 'Host: attacker.com' {host}/api/reset-password -d 'email=test@test.com'\n3. Check if the password reset email contains attacker.com in the link\n\nAlso test: X-Forwarded-Host, X-Forwarded-Server, Forwarded" },
  { key: "directory_listing", title: "Directory Listing", severity: "low",
    instructions: "Target: {host}\nCheck for directory listing on common paths:\ncurl -I {host}/assets/\ncurl -I {host}/static/\ncurl -I {host}/uploads/\ncurl -I {host}/backup/\ncurl -I {host}/images/\ncurl -I {host}/files/\n\nIf directory listing is enabled, you may find backup files, source code dumps, or configuration files." },
  { key: "info_disclosure", title: "Information Disclosure", severity: "low",
    instructions: "Target: {host}\nCheck for information leakage:\ncurl -I {host}\n\nLook for:\n- Server header with version (Apache/2.4.6, nginx/1.18.0)\n- X-Powered-By (PHP/7.4, Express, ASP.NET)\n- X-AspNet-Version\n- Via header (Varnish, CloudFlare, Akamai versions)\n\nAlso check:\n- /robots.txt — hidden paths\n- /sitemap.xml — all page URLs\n- /404 and other error pages — stack traces" },
];

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = { critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94" };
  const c = colors[severity] || colors.low;
  return <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
    style={{ background: `${c}22`, color: c }}>{severity}</span>;
}

function CollapsibleLesson({ moduleName: _moduleName }: { moduleName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-text hover:bg-surface-2/80 transition-colors">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-accent" />
          Learn about this test type
        </div>
        {open ? <ChevronDown size={14} className="text-text-dim" /> : <ChevronRight size={14} className="text-text-dim" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs text-text-dim leading-relaxed">
          <div>
            <strong className="text-accent text-[11px]">What you're doing:</strong>
            <p className="mt-1">{lessons.what}</p>
          </div>
          <div>
            <strong className="text-accent text-[11px]">Why it matters:</strong>
            <p className="mt-1">{lessons.why}</p>
          </div>
          <div>
            <strong className="text-accent text-[11px]">What to look for:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {lessons.indicators.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
          <div>
            <strong className="text-accent text-[11px]">Common mistakes:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {lessons.mistakes.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

interface VerifyFormProps {
  host: string;
  onSave: () => void;
  onBack: () => void;
}

function VerifyForm({ host, onSave, onBack }: VerifyFormProps) {
  const [form, setForm] = useState<FindingForm>({ url: "", request: "", response: "", steps: "", impact: "", severity: "high", title: "" });

  const handleSave = () => {
    const finding = {
      ...form,
      title: form.title || `Infrastructure finding on ${host}`,
      _ts: Date.now(),
      module: "Infrastructure",
    };
    const storageKey = `findings_${location.pathname.match(/\d+/)?.[0] || "0"}`;
    try {
      const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
      existing.push(finding);
      localStorage.setItem(storageKey, JSON.stringify(existing));
    } catch { /* ignore */ }
    onSave();
    toast.success("Finding saved!");
    onBack();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-yellow">
        <AlertTriangle size={14} />
        <span className="text-xs font-semibold text-text">Vulnerability Verified — Log Your Finding</span>
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Finding Title</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. AWS Metadata SSRF via URL Parameter"
          className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-text-dim block mb-1">Affected URL</label>
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder={host}
            className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </div>
        <div>
          <label className="text-[11px] text-text-dim block mb-1">Severity</label>
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}
            className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent">
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Request</label>
        <textarea value={form.request} onChange={(e) => setForm({ ...form, request: e.target.value })} rows={3}
          className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none font-mono" />
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Response</label>
        <textarea value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} rows={3}
          className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none font-mono" />
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Steps to Reproduce</label>
        <textarea value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} rows={3}
          placeholder="1. Send GET /api/proxy?url=http://169.254.169.254/latest/meta-data/\n2. Observe AWS IAM role credentials in response\n3. Use credentials to access AWS services"
          className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none" />
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Impact</label>
        <textarea value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} rows={2}
          placeholder="An attacker can access AWS cloud metadata and retrieve IAM credentials, leading to full cloud account compromise"
          className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none" />
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={handleSave}
          className="px-4 py-2 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors">
          Save Finding
        </button>
        <button onClick={onBack}
          className="px-4 py-2 bg-surface-2 text-text-dim text-xs font-medium rounded-lg hover:text-text transition-colors">
          Back
        </button>
      </div>
    </div>
  );
}

export default function InfraModule({ host, targetId }: InfraModuleProps) {
  const [tab, setTab] = useState("discover");
  const [endpoints, setEndpoints] = useState<{ url?: string }[]>([]);
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`infra_tests_${host}`) || "{}");
    } catch { return {}; }
  });
  const [showVerify, setShowVerify] = useState<string | null>(null);
  const [showPayloadLib, setShowPayloadLib] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [liveHostId, setLiveHostId] = useState<number | null>(null);

  function analyzeSurface(eps: { url?: string }[]) {
    const urls = eps.map((e) => e.url || "");
    const hostUrls = urls.filter((u) => u.toLowerCase().includes(host.toLowerCase()));
    const allPaths = [...new Set(hostUrls.map((u) => {
      try { return new URL(u).pathname; } catch { return u; }
    }))];
    const found: DiscoverResult = {
      fileParams: allPaths.some((p) => /file=|download=|path=|page=|include=|template=/i.test(p)),
      proxyParams: allPaths.some((p) => /url=|href=|src=|redirect=|callback=|dest=/i.test(p)),
      cloudUrls: allPaths.some((p) => /s3\.amazonaws|storage\.google|digitaloceanspaces|blob\.core/i.test(p)),
      adminPanels: allPaths.some((p) => /admin|dashboard|console|manage|backend/i.test(p)),
      uploadEndpoints: allPaths.some((p) => /upload|import|attachment/i.test(p)),
      apiEndpoints: allPaths.some((p) => /\/api\/|\/v1\/|\/v2\//i.test(p)),
    };
    setDiscoverResults(found);
  }

  useEffect(() => {
    fetchEndpoints(targetId, { size: 500 }).then((r) => {
      setEndpoints(r.items || []);
      analyzeSurface(r.items || []);
    }).catch(() => {});
    fetchLiveHosts(targetId, { size: 100 }).then((r) => {
      const match = (r.items || []).find((h) => h.url?.includes(host.replace(/^https?:\/\//, "").split("/")[0]));
      if (match) setLiveHostId(match.id);
    }).catch(() => {});
  }, [targetId]);

  function toggleTest(key: string) {
    const updated = { ...tests, [key]: { ...tests[key], done: !tests[key]?.done } };
    setTests(updated);
    localStorage.setItem(`infra_tests_${host}`, JSON.stringify(updated));
  }

  function markVulnerable(key: string) {
    setShowVerify(key);
  }

  function openPayloadLib(category: string) {
    setShowPayloadLib(category);
  }

  async function handleAiSuggestions() {
    if (!liveHostId) { toast.error("Could not identify live host for this target"); return; }
    setAiLoading(true);
    setAiSuggestions(null);
    try {
      const result = await aiAdvisor(targetId, { live_host_id: liveHostId, module: "infrastructure" });
      setAiSuggestions(result.suggestions || []);
      if (!result.suggestions?.length) toast.success("No AI suggestions available");
      else toast.success(`Got ${result.suggestions.length} suggestions`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setAiLoading(false); }
  }

  function getProgress() {
    const total = testItems.length;
    const done = Object.values(tests).filter((t) => t.done).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  const infraSurface = [
    { label: "File Serving Params", found: discoverResults?.fileParams },
    { label: "URL / Proxy Params", found: discoverResults?.proxyParams },
    { label: "Cloud Storage URLs", found: discoverResults?.cloudUrls },
    { label: "Admin / Manage Panels", found: discoverResults?.adminPanels },
    { label: "File Upload", found: discoverResults?.uploadEndpoints },
    { label: "API Endpoints", found: discoverResults?.apiEndpoints },
  ];

  const { done, total, pct } = getProgress();

  return (
    <div className="space-y-4">
      <CollapsibleLesson moduleName="infrastructure" />

      <div className="flex gap-1 border-b border-white/5">
        {["discover", "test", "verify"].map((t) => {
          const labels: Record<string, string> = { discover: "Discover", test: "Test", verify: "Verify" };
          const icons: Record<string, string> = { discover: "🔍", test: "🧪", verify: "📋" };
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all ${active ? "border-accent text-accent" : "border-transparent text-text-dim hover:text-text"}`}>
              <span>{icons[t]}</span> {labels[t]}
            </button>
          );
        })}
      </div>

      {tab === "discover" && (
        <div className="space-y-4">
          <p className="text-xs text-text-dim">Infrastructure-relevant endpoints detected from crawl results.</p>
          <div className="grid grid-cols-2 gap-2">
            {infraSurface.map((ep) => (
              <div key={ep.label}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${ep.found ? "bg-green-subtle border-green/30 text-green" : "bg-surface-2 border-white/5 text-text-dim"}`}>
                <span className="font-medium">{ep.label}</span>
                {ep.found ? <CheckCircle size={14} /> : <XCircle size={14} />}
              </div>
            ))}
          </div>
          <div className="bg-accent-subtle/30 border border-accent/20 rounded-lg p-3 text-xs text-text-dim">
            <strong className="text-accent">Next step:</strong> Move to the Test tab and work through the 12 infrastructure test items. Start with SSRF and XXE — critical severity and highest cloud account impact.
          </div>
        </div>
      )}

      {tab === "test" && showPayloadLib && (
        <div className="space-y-3">
          <button onClick={() => setShowPayloadLib(null)}
            className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-text transition-colors">
            <ChevronRight size={14} className="rotate-180" />
            Back to tests
          </button>
          <PayloadLibrary
            category={showPayloadLib}
            targetUrl={`http://${host}`}
            onClose={() => setShowPayloadLib(null)}
          />
        </div>
      )}

      {tab === "test" && showVerify && !showPayloadLib && (
        <VerifyForm host={host} onSave={() => setShowVerify(null)} onBack={() => setShowVerify(null)} />
      )}

      {tab === "test" && !showVerify && !showPayloadLib && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-text-dim mb-2">
            <span>{done}/{total} tests completed</span>
            <div className="flex items-center gap-2">
              <span>{pct}%</span>
              <button onClick={handleAiSuggestions} disabled={aiLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-accent-subtle text-accent text-[10px] font-medium hover:bg-accent/20 disabled:opacity-50 transition-colors">
                {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {aiLoading ? "Loading..." : "Get AI Suggestions"}
              </button>
            </div>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          {aiSuggestions && aiSuggestions.length > 0 && (
            <div className="border border-accent/20 bg-accent-subtle/10 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-accent flex items-center gap-1"><Sparkles size={12} /> AI Suggestions</span>
                <button onClick={() => setAiSuggestions(null)} className="text-text-dim hover:text-text p-0.5"><X size={12} /></button>
              </div>
              {aiSuggestions.map((s, i) => (
                <div key={i} className="text-xs text-text-dim border-b border-white/5 last:border-0 pb-2 last:pb-0">
                  <div className="font-medium text-text">{s.test}</div>
                  <div className="text-[11px] mt-0.5">{s.reason}</div>
                  {s.specific_url && <div className="text-[10px] font-mono text-accent mt-0.5">URL: {s.specific_url}</div>}
                  {s.payload_hint && <div className="text-[10px] font-mono text-yellow mt-0.5">Payload: {s.payload_hint}</div>}
                </div>
              ))}
            </div>
          )}
          {testItems.map((item) => {
            const state = tests[item.key] || {};
            return (
              <div key={item.key}
                className={`border rounded-lg transition-colors ${state.done ? "border-green/30 bg-green-subtle/10" : "border-white/5 bg-surface-2"}`}>
                <div className="flex items-start gap-3 p-3">
                  <input type="checkbox" checked={!!state.done}
                    onChange={() => toggleTest(item.key)}
                    className="mt-0.5 accent-accent w-4 h-4 rounded border-white/5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text">{item.title}</span>
                      <SeverityBadge severity={item.severity} />
                    </div>
                    <details className="mt-1.5">
                      <summary className="text-[11px] text-accent cursor-pointer hover:underline">View instructions</summary>
                      <pre className="mt-2 text-[11px] text-text-dim bg-surface border border-white/5 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                        {item.instructions.replace(/\{host\}/g, host)}
                      </pre>
                    </details>
                    {item.payloadCategory && (
                      <button onClick={() => openPayloadLib(item.payloadCategory)}
                        className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-accent-subtle text-accent hover:bg-accent/20 transition-colors">
                        <Beaker size={11} />
                        Payload Library ({item.payloadCategory.replace(/_/g, " ")})
                      </button>
                    )}
                  </div>
                  <button onClick={() => markVulnerable(item.key)}
                    className="shrink-0 px-2 py-1 rounded text-[10px] font-medium bg-red-subtle text-red hover:bg-red/20 transition-colors">
                    Mark Vulnerable
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "verify" && (
        <div className="space-y-4">
          <p className="text-xs text-text-dim">Items you marked as vulnerable. Fill in details to save as a finding.</p>
          {Object.keys(tests).some((k) => tests[k]?.vulnerable) ? (
            <div className="space-y-2">
              {testItems.filter((item) => tests[item.key]?.vulnerable).map((item) => (
                <div key={item.key}
                  className="bg-yellow-subtle/10 border border-yellow/30 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-text">{item.title}</div>
                    <SeverityBadge severity={item.severity} />
                  </div>
                  <button onClick={() => setShowVerify(item.key)}
                    className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors">
                    Document
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-xs text-text-dim">No vulnerabilities marked yet.</p>
              <p className="text-[11px] text-text-dim/60 mt-1">Go to the Test tab and click "Mark Vulnerable" on any test item.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
