import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, XCircle, BookOpen, Sparkles, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { fetchEndpoints, fetchSecrets, fetchLiveHosts, aiAdvisor } from "../../api";

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
  login: boolean;
  reset: boolean;
  jwt: boolean;
  register: boolean;
  admin: boolean;
  api: boolean;
}

interface AiSuggestion {
  test: string;
  reason: string;
  specific_url?: string;
  payload_hint?: string;
}

interface AuthModuleProps {
  host: string;
  targetId: number;
}

const lessons = {
  what: "Authentication and authorization (Auth) tests check if users are who they say they are and can only access what they're supposed to. Attackers exploit broken auth to impersonate users, escalate privileges, or bypass access controls entirely.",
  why: "Auth flaws are the #1 source of critical-severity findings. Facebook paid $20,000 for an IDOR that let attackers take over any account. GitHub paid $25,000 for a session fixation bug affecting OAuth apps.",
  indicators: [
    "Sequential user IDs in URLs or API responses (e.g. /api/user/1001, /api/user/1002)",
    "JWT tokens with 'alg':'none' or weak secrets",
    "Password reset links that don't expire or have predictable tokens",
    "Session tokens that don't change after login",
    "Admin panels accessible without admin credentials",
    "API endpoints that accept requests without proper authorization headers",
  ],
  mistakes: [
    "Only testing with your own account — test with DIFFERENT privilege levels",
    "Assuming OAuth/SSO is secure — the state parameter is often missing",
    "Forgetting to test POST/DELETE endpoints after confirming GET access",
  ],
};

const testItems = [
  { key: "default_creds", title: "Default Credentials", severity: "high",
    instructions: "Target: {host}\nTry these common credential pairs:\n- admin:admin\n- admin:password\n- admin:admin123\n- root:root\n- test:test\n\nBurp: Proxy request to /login, send to Intruder, add username and password payload positions." },
  { key: "reset_expiration", title: "Password Reset Link Expiration", severity: "high",
    instructions: "Target: {host}\n1. Request password reset for your test account\n2. Check email, get the reset link\n3. Wait 10 minutes\n4. Try the original reset link\n\nIf the link still works, this is a finding." },
  { key: "reset_entropy", title: "Password Reset Token Entropy", severity: "medium",
    instructions: "Target: {host}\n1. Request password reset 3-5 times\n2. Collect each reset token\n3. Compare token patterns — are they sequential? timestamp-based?\n4. Try JWT decoding if tokens look base64\n\ne.g. if tokens are 'abc001', 'abc002', 'abc003' — predictable." },
  { key: "jwt_none", title: "JWT alg:none Attack", severity: "critical",
    instructions: "Target: {host}\n1. Capture your JWT token\n2. Decode the header (base64)\n3. Change 'alg':'RS256' to 'alg':'none'\n4. Remove the signature portion entirely\n5. Re-encode and send to the API\n\ncurl -H 'Authorization: Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ.' {host}/api/admin" },
  { key: "jwt_secret", title: "JWT Weak Secret", severity: "critical",
    instructions: "Target: {host}\n1. Capture your JWT\n2. Use jwt_tool or hashcat to bruteforce:\n   python jwt_tool.py <token> -C -d /usr/share/wordlists/rockyou.txt\n3. If secret is cracked, forge arbitrary tokens" },
  { key: "session_fixation", title: "Session Fixation", severity: "high",
    instructions: "Target: {host}\n1. Visit the login page and capture the pre-auth session cookie\n2. Login with valid credentials\n3. Check if the session cookie CHANGED after login\n4. If it stayed the same, the app is vulnerable to session fixation" },
  { key: "session_invalidation", title: "Session Invalidation on Logout", severity: "high",
    instructions: "Target: {host}\n1. Login and capture the session token\n2. Logout\n3. Try using the same session token in a new request\n   curl -H 'Cookie: session=<oldtoken>' {host}/api/me\nIf the request succeeds, the session was not invalidated." },
  { key: "concurrent_sessions", title: "Concurrent Sessions", severity: "medium",
    instructions: "Target: {host}\n1. Login from Browser A\n2. Login from Browser B with the same credentials\n3. Go back to Browser A — does it still work?\n4. Both sessions being active simultaneously is expected behavior, but check if the app enforces any limits (e.g. max 5 sessions)" },
  { key: "idor", title: "IDOR on User IDs", severity: "high",
    instructions: "Target: {host}\n1. Find any endpoint that uses user IDs (e.g. /api/user/123, /profile?id=456)\n2. Create two accounts (A and B)\n3. Login as Account A\n4. Try accessing Account B's data by changing the ID\n\ncurl -H 'Cookie: session=A' {host}/api/user/124\nIf you see Account B's data, you found an IDOR." },
  { key: "priv_esc", title: "Privilege Escalation", severity: "critical",
    instructions: "Target: {host}\n1. Login as a low-privilege user\n2. Collect all your cookies, headers, and tokens\n3. Try accessing admin endpoints:\n   - /admin\n   - /api/admin/users\n   - /api/v1/admin/settings\n4. Try modifying requests to elevate role:\n   - Change 'role':'user' to 'role':'admin' in POST data\n   - Add 'admin':true to your JSON body" },
  { key: "oauth_state", title: "OAuth State Parameter", severity: "medium",
    instructions: "Target: {host}\n1. Start OAuth login flow\n2. Capture the authorization URL — look for 'state' parameter\n3. Complete login with the real state\n4. Try initiating a new OAuth flow and swapping the state parameter\n5. If the server doesn't validate state, this is a CSRF-style OAuth attack" },
  { key: "mfa_bypass", title: "MFA Bypass", severity: "critical",
    instructions: "Target: {host}\n1. Complete MFA setup and generate a valid MFA token\n2. Logout completely\n3. Login again with the same credentials\n4. When prompted for MFA, try reusing the OLD MFA token\n5. Also check if you can skip MFA by:\n   - Directly accessing the app after login without completing MFA\n   - Modifying the response to the MFA challenge\n   - Using a different device/user-agent" },
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
  onSave: (finding: Record<string, unknown>) => void;
  onBack: () => void;
}

function VerifyForm({ host, onSave, onBack }: VerifyFormProps) {
  const [form, setForm] = useState<FindingForm>({ url: "", request: "", response: "", steps: "", impact: "", severity: "high", title: "" });

  const handleSave = () => {
    const finding = {
      ...form,
      title: form.title || `Auth finding on ${host}`,
      _ts: Date.now(),
      module: "Authentication & Authorization",
    };
    const storageKey = `findings_${location.pathname.match(/\d+/)?.[0] || "0"}`;
    try {
      const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
      existing.push(finding);
      localStorage.setItem(storageKey, JSON.stringify(existing));
    } catch { /* ignore */ }
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
          placeholder="e.g. IDOR on User Profile Endpoint"
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
          placeholder="1. Login as normal user\n2. Navigate to /api/users/1001\n3. Change ID to 1002\n4. Observe another user's data"
          className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none" />
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Impact</label>
        <textarea value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} rows={2}
          placeholder="An attacker can view and modify any user's personal data without authorization"
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

export default function AuthModule({ host, targetId }: AuthModuleProps) {
  const [tab, setTab] = useState("discover");
  const [endpoints, setEndpoints] = useState<{ url?: string }[]>([]);
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`auth_tests_${host}`) || "{}");
    } catch { return {}; }
  });
  const [vulnerable, setVulnerable] = useState<string | null>(null);
  const [showVerify, setShowVerify] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [liveHostId, setLiveHostId] = useState<number | null>(null);

  function analyzeSurface(eps: { url?: string }[]) {
    const urls = eps.map((e) => e.url || "");
    const hostLower = host.toLowerCase();
    const hostUrls = urls.filter((u) => u.toLowerCase().includes(hostLower));
    const pathOnly = hostUrls.map((u) => {
      try { return new URL(u).pathname; } catch { return u; }
    });
    const allPaths = [...new Set([...pathOnly, ...hostUrls.map((u) => u.toLowerCase())])];
    const found: DiscoverResult = {
      login: allPaths.some((p) => /login|signin|auth/i.test(p)),
      reset: allPaths.some((p) => /forgot|reset|password/i.test(p)),
      jwt: allPaths.some((p) => /token|jwt/i.test(p)),
      register: allPaths.some((p) => /register|signup|create-account/i.test(p)),
      admin: allPaths.some((p) => /admin|dashboard|console/i.test(p)),
      api: allPaths.some((p) => /\/api\/|\/v1\/|\/v2\//i.test(p)),
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
    localStorage.setItem(`auth_tests_${host}`, JSON.stringify(updated));
  }

  function markVulnerable(key: string) {
    setShowVerify(key);
  }

  function handleVerified(_finding: Record<string, unknown>) {
    setShowVerify(null);
  }

  async function handleAiSuggestions() {
    if (!liveHostId) { toast.error("Could not identify live host for this target"); return; }
    setAiLoading(true);
    setAiSuggestions(null);
    try {
      const result = await aiAdvisor(targetId, { live_host_id: liveHostId, module: "auth" });
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

  const authEndpoints = [
    { path: "/login", found: discoverResults?.login },
    { path: "/register", found: discoverResults?.register },
    { path: "/reset-password", found: discoverResults?.reset },
    { path: "/api/auth/*", found: discoverResults?.api },
    { path: "/admin", found: discoverResults?.admin },
    { path: "JWT tokens", found: discoverResults?.jwt },
  ];

  const { done, total, pct } = getProgress();
  const anyVulnerable = Object.keys(tests).some((k) => tests[k]?.vulnerable);

  return (
    <div className="space-y-4">
      <CollapsibleLesson moduleName="auth" />

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
          <p className="text-xs text-text-dim">Identified auth-related endpoints from the crawl results for this host.</p>
          <div className="grid grid-cols-2 gap-2">
            {authEndpoints.map((ep) => (
              <div key={ep.path}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${ep.found ? "bg-green-subtle border-green/30 text-green" : "bg-surface-2 border-white/5 text-text-dim"}`}>
                <span className="font-medium">{ep.path}</span>
                {ep.found ? <CheckCircle size={14} /> : <XCircle size={14} />}
              </div>
            ))}
          </div>
          <div className="bg-accent-subtle/30 border border-accent/20 rounded-lg p-3 text-xs text-text-dim">
            <strong className="text-accent">Next step:</strong> Move to the Test tab and work through the 12 auth test items.
          </div>
        </div>
      )}

      {tab === "test" && showVerify && (
        <VerifyForm host={host} onSave={handleVerified} onBack={() => setShowVerify(null)} />
      )}

      {tab === "test" && !showVerify && (
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
          {anyVulnerable ? (
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
