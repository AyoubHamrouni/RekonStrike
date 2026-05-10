import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, XCircle, BookOpen, Sparkles, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { fetchEndpoints, fetchLiveHosts, aiAdvisor } from "../../api";

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
  objectIds: boolean;
  checkout: boolean;
  coupons: boolean;
  multiStep: boolean;
  apiWrite: boolean;
  moneyOps: boolean;
}

interface AiSuggestion {
  test: string;
  reason: string;
  specific_url?: string;
  payload_hint?: string;
}

interface LogicModuleProps {
  host: string;
  targetId: number;
}

const lessons = {
  what: "Business logic testing means understanding the application's intended flow, then asking 'what if I skip step 2?' or 'what if I do step 3 twice?' or 'what if user A tries user B's data?'. These aren't technical bugs — they're design flaws that let attackers abuse features in ways the developers didn't anticipate.",
  why: "Logic bugs require human creativity to find, which means higher bounties. Twitter paid $15,000 for an SMS takeover via race condition, Uber paid $20,000 for a coupon manipulation bug, and a Shopify gift card bypass paid $8,000. These bugs exist in every application that processes money or permissions.",
  indicators: [
    "Sequential or predictable object IDs in URLs or API responses",
    "Multi-step workflows where steps could be reordered or skipped",
    "Numeric fields (prices, quantities, discounts) in the request body",
    "Coupon, promo code, or referral systems with limited-use logic",
    "Any operation that involves money, tokens, or limited resources",
    "Role/permission fields in API requests that could be manipulated",
  ],
  mistakes: [
    "Only testing with a single account — many logic bugs require two or more accounts",
    "Assuming frontend validation equals server-side security",
    "Not testing concurrent requests — race conditions require precise timing",
    "Forgetting edge cases: negative numbers, zero quantities, decimal prices, empty strings",
  ],
};

const testItems = [
  { key: "bola_idor", title: "BOLA / IDOR", severity: "critical",
    instructions: "Target: {host}\nFind any object ID in URLs or API responses and change it to another user's ID:\n1. Login as User A and capture a request with an object ID\n2. Change the ID value: /api/users/1001 → /api/users/1002\n3. If you see User B's data, you found an IDOR\n\ncurl -H 'Cookie: session=A' {host}/api/v1/users/1002\ncurl -H 'Cookie: session=A' {host}/api/v1/orders/ORD-2002" },
  { key: "mass_assignment", title: "Mass Assignment", severity: "high",
    instructions: "Target: {host}\nSend extra fields in POST/PUT requests:\n{\"name\": \"test\", \"role\": \"admin\", \"is_admin\": true}\n{\"name\": \"test\", \"permissions\": [\"*\"]}\n{\"name\": \"test\", \"is_verified\": true, \"balance\": 999999}\n\nCheck for fields like: admin, role, permissions, is_admin, is_verified, balance, credit, token, email_verified_at" },
  { key: "price_manipulation", title: "Price Manipulation", severity: "high",
    instructions: "Target: {host}\nIntercept checkout requests and modify price fields:\n1. Add item to cart, capture the checkout request\n2. Modify: \"price\": 0.01 or \"price\": 0\n3. Modify: \"discount\": 100 or \"total\": 0\n4. Modify: \"quantity\": -1 (may create negative charges)\n\nAlso test integer overflow with very large numbers." },
  { key: "quantity_bypass", title: "Quantity Bypass", severity: "medium",
    instructions: "Target: {host}\nTest quantity/amount fields for logic flaws:\n- Set quantity to 0: does the item get added for free?\n- Set quantity to -1: does it subtract from the total?\n- Set quantity to 999999: does it overflow?\n- Set quantity to 0.5: does it accept fractions?\n- Set quantity to a negative then positive: race condition on inventory?" },
  { key: "step_skipping", title: "Step Skipping", severity: "high",
    instructions: "Target: {host}\nAccess workflow steps directly to skip prerequisites:\n1. Start a multi-step process (checkout, signup, onboarding)\n2. Complete step 1, then try accessing the step 3 URL directly\n3. Try: /checkout/confirm without /checkout/payment\n4. Try: /dashboard without completing /onboarding/step2\n5. Try: /order/complete without adding anything to cart" },
  { key: "race_coupon", title: "Race Condition — Coupon", severity: "critical",
    instructions: "Target: {host}\nSend 10 concurrent requests to use the same coupon/referral code:\nfor i in $(seq 1 10); do\n  curl -X POST {host}/api/redeem -d 'code=DISCOUNT50' &\ndone\n\nIf you get the discount applied multiple times, there's a race condition.\nAlso test on: gift cards, promotional credits, referral bonuses." },
  { key: "race_balance", title: "Race Condition — Balance", severity: "critical",
    instructions: "Target: {host}\nRace condition on financial operations:\n1. Open two terminals/windows\n2. Send concurrent withdrawal requests:\n   curl -X POST {host}/api/withdraw -d 'amount=100' &\n   curl -X POST {host}/api/withdraw -d 'amount=100' &\n   curl -X POST {host}/api/withdraw -d 'amount=100' &\n3. Check if your balance decreased by 100 or 300\n\nAlso test on: transfers, purchases, reward redemption." },
  { key: "auth_bypass_role", title: "Function-Level Auth Bypass", severity: "critical",
    instructions: "Target: {host}\nTry to access privileged functions as a low-privilege user:\n1. Login as low-privilege user, capture the JWT/cookie\n2. Modify the role/permission claims:\n   - Decode JWT, change 'role':'user' to 'role':'admin'\n   - Add 'admin':true to the cookie\n   - Change 'permissions':['read'] to 'permissions':['read','write','delete']\n3. Retry the privileged action: GET /api/admin/users" },
  { key: "method_override", title: "HTTP Method Override", severity: "medium",
    instructions: "Target: {host}\nTest HTTP method override headers:\ncurl -X POST {host}/api/v1/admin/users \\\n  -H 'X-HTTP-Method-Override: GET'\ncurl -X GET {host}/api/v1/admin/users \\\n  -H 'X-HTTP-Method-Override: DELETE'\n\nAlso test:\n- X-HTTP-Method: DELETE\n- X-Method-Override: PUT\n- _method=DELETE (URL param override)" },
  { key: "parameter_pollution", title: "HTTP Parameter Pollution", severity: "medium",
    instructions: "Target: {host}\nSend duplicate parameters — the server may process them differently:\n- ?user_id=victim&user_id=attacker\n- ?role=user&role=admin\n- ?action=view&action=delete\n\nCommon targets:\n- OAuth redirect_uri parameters\n- API endpoints with array-style params\n- SQL queries built from URL params" },
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
      title: form.title || `Logic finding on ${host}`,
      _ts: Date.now(),
      module: "Business Logic",
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
          placeholder="e.g. IDOR on User Profile Data"
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
          placeholder="1. Login as normal user\n2. Send GET /api/users/1001 with session cookie\n3. Change user ID to 1002\n4. Observe another user's profile data"
          className="w-full bg-surface-2 border border-white/5 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none" />
      </div>
      <div>
        <label className="text-[11px] text-text-dim block mb-1">Impact</label>
        <textarea value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} rows={2}
          placeholder="An attacker can access and modify any user's sensitive data without authorization"
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

export default function LogicModule({ host, targetId }: LogicModuleProps) {
  const [tab, setTab] = useState("discover");
  const [endpoints, setEndpoints] = useState<{ url?: string }[]>([]);
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`logic_tests_${host}`) || "{}");
    } catch { return {}; }
  });
  const [showVerify, setShowVerify] = useState<string | null>(null);
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
      objectIds: allPaths.some((p) => /\/(\d+)\/?$|\/users\/\d+|\/orders\/\d+|\/items\/\d+/i.test(p)),
      checkout: allPaths.some((p) => /checkout|cart|purchase|order|payment|pay/i.test(p)),
      coupons: allPaths.some((p) => /coupon|promo|discount|refer|gift/i.test(p)),
      multiStep: allPaths.some((p) => /step|wizard|onboard|signup.*step/i.test(p)),
      apiWrite: allPaths.some((p) => /\/api\/|\/v1\/|\/v2\//i.test(p)),
      moneyOps: allPaths.some((p) => /transfer|withdraw|deposit|balance|wallet/i.test(p)),
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
    localStorage.setItem(`logic_tests_${host}`, JSON.stringify(updated));
  }

  function markVulnerable(key: string) {
    setShowVerify(key);
  }

  async function handleAiSuggestions() {
    if (!liveHostId) { toast.error("Could not identify live host for this target"); return; }
    setAiLoading(true);
    setAiSuggestions(null);
    try {
      const result = await aiAdvisor(targetId, { live_host_id: liveHostId, module: "logic" });
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

  const logicSurface = [
    { label: "Object IDs (IDOR target)", found: discoverResults?.objectIds },
    { label: "Checkout / Payment", found: discoverResults?.checkout },
    { label: "Coupon / Promo Codes", found: discoverResults?.coupons },
    { label: "Multi-Step Workflows", found: discoverResults?.multiStep },
    { label: "API Write Endpoints", found: discoverResults?.apiWrite },
    { label: "Money Operations", found: discoverResults?.moneyOps },
  ];

  const { done, total, pct } = getProgress();

  return (
    <div className="space-y-4">
      <CollapsibleLesson moduleName="logic" />

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
          <p className="text-xs text-text-dim">Business-logic-relevant endpoints detected from crawl results.</p>
          <div className="grid grid-cols-2 gap-2">
            {logicSurface.map((ep) => (
              <div key={ep.label}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${ep.found ? "bg-green-subtle border-green/30 text-green" : "bg-surface-2 border-white/5 text-text-dim"}`}>
                <span className="font-medium">{ep.label}</span>
                {ep.found ? <CheckCircle size={14} /> : <XCircle size={14} />}
              </div>
            ))}
          </div>
          <div className="bg-accent-subtle/30 border border-accent/20 rounded-lg p-3 text-xs text-text-dim">
            <strong className="text-accent">Next step:</strong> Move to the Test tab and work through the 10 business logic test items. Start with IDOR and race conditions — highest payout potential.
          </div>
        </div>
      )}

      {tab === "test" && showVerify && (
        <VerifyForm host={host} onSave={() => setShowVerify(null)} onBack={() => setShowVerify(null)} />
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
