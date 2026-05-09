import { useState } from "react";
import { Brain, Loader2, AlertTriangle, CheckCircle, X, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";

const severityColors = { critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94" };

export default function AIPanel({ targetId, stats, hasProgramScope }) {
  const [surfaceResult, setSurfaceResult] = useState(null);
  const [triageResult, setTriageResult] = useState(null);
  const [fpResult, setFpResult] = useState(null);
  const [scopeResult, setScopeResult] = useState(null);
  const [loading, setLoading] = useState(null);

  async function runSurface() {
    setLoading("surface");
    setSurfaceResult(null);
    try {
      const r = await fetch(`/targets/${targetId}/ai/surface`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).detail || "Request failed");
      setSurfaceResult(await r.json());
      toast.success("Surface analysis complete");
    } catch (e) { toast.error(e.message); }
    finally { setLoading(null); }
  }

  async function runTriage() {
    setLoading("triage");
    setTriageResult(null);
    try {
      const r = await fetch(`/targets/${targetId}/ai/triage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).detail || "Request failed");
      setTriageResult(await r.json());
      toast.success("Triage complete");
    } catch (e) { toast.error(e.message); }
    finally { setLoading(null); }
  }

  async function runFpFilter() {
    setLoading("fp");
    setFpResult(null);
    try {
      const r = await fetch(`/targets/${targetId}/ai/fp-filter`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).detail || "Request failed");
      setFpResult(await r.json());
      toast.success("FP filter complete");
    } catch (e) { toast.error(e.message); }
    finally { setLoading(null); }
  }

  async function runScope() {
    setLoading("scope");
    setScopeResult(null);
    try {
      const r = await fetch(`/targets/${targetId}/ai/scope`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).detail || "Request failed");
      setScopeResult(await r.json());
      toast.success("Scope analysis complete");
    } catch (e) { toast.error(e.message); }
    finally { setLoading(null); }
  }

  function PriorityBadge({ rank }) {
    const colors = { 1: "#e05a4f", 2: "#f0b429", 3: "#4a9eff" };
    const c = colors[rank] || "#7c7e94";
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${c}22`, color: c }}>#{rank}</span>;
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Brain size={16} className="text-accent" />
        <h3 className="text-xs font-semibold text-text uppercase tracking-wider">AI Analysis</h3>
      </div>

      {/* Section 1: Surface Analysis */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text">Attack Surface Analysis</span>
          <button onClick={runSurface} disabled={loading === "surface"}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-white text-[10px] font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {loading === "surface" ? <Loader2 size={11} className="animate-spin" /> : null}
            {loading === "surface" ? `Analyzing ${stats?.live_hosts || 0} hosts...` : "Run Analysis"}
          </button>
        </div>
        {surfaceResult && (
          <div className="space-y-2 text-xs text-text-dim bg-surface-2 rounded-lg p-3">
            <p className="text-text">{surfaceResult.surface_summary}</p>
            {surfaceResult.anomalies?.length > 0 && (
              <div>
                <span className="text-yellow font-medium">Anomalies</span>
                {surfaceResult.anomalies.map((a, i) => (
                  <div key={i} className="flex items-start gap-1 mt-1">
                    <AlertTriangle size={11} className="text-yellow mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[11px] font-mono text-text">{a.url}</div>
                      <div className="text-[10px]">{a.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {surfaceResult.recommended_focus?.length > 0 && (
              <div>
                <span className="text-accent font-medium">Recommended Focus</span>
                {surfaceResult.recommended_focus.map((r, i) => (
                  <div key={i} className="mt-1">
                    <div className="text-[11px] font-mono text-text">{r.url}</div>
                    <div className="text-[10px]">{r.rationale}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Triage Findings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text">Triage Findings</span>
          <button onClick={runTriage} disabled={loading === "triage"}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-white text-[10px] font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {loading === "triage" ? <Loader2 size={11} className="animate-spin" /> : null}
            {loading === "triage" ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>
        {triageResult && (
          <div className="space-y-1.5">
            {triageResult.length === 0 && <p className="text-xs text-text-dim">No findings to triage.</p>}
            {triageResult.map((f, i) => (
              <div key={i} className={`bg-surface-2 border rounded-lg p-3 text-xs ${f.likely_false_positive ? "border-red/20 opacity-50" : "border-border"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <PriorityBadge rank={f.priority_rank} />
                  <span className={`font-medium text-text text-[11px] ${f.likely_false_positive ? "line-through" : ""}`}>{f.name}</span>
                  <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: `${severityColors[f.severity] || "#7c7e94"}22`, color: severityColors[f.severity] || "#7c7e94" }}>
                    {f.severity}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-dim">
                  <div className="flex items-center gap-1">
                    <span>Confidence</span>
                    <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(f.confidence || 0) * 100}%`, background: f.confidence > 0.7 ? "#00d4aa" : f.confidence > 0.4 ? "#f0b429" : "#e05a4f" }} />
                    </div>
                    <span>{Math.round((f.confidence || 0) * 100)}%</span>
                  </div>
                  {f.likely_false_positive && (
                    <span className="inline-flex items-center gap-0.5 text-red"><X size={10} /> Likely FP</span>
                  )}
                </div>
                {f.triage_note && <div className="text-[10px] text-text-dim mt-1 italic">{f.triage_note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Filter False Positives */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text">Filter False Positives</span>
          <button onClick={runFpFilter} disabled={loading === "fp"}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-white text-[10px] font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {loading === "fp" ? <Loader2 size={11} className="animate-spin" /> : null}
            {loading === "fp" ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>
        {fpResult && (
          <div className="space-y-1.5">
            {fpResult.length === 0 && <p className="text-xs text-text-dim">No findings to analyze.</p>}
            {fpResult.map((f, i) => {
              const score = f.fp_score || 0.5;
              const likelyFp = score < 0.3;
              return (
                <div key={i} className={`bg-surface-2 border rounded-lg p-3 text-xs ${likelyFp ? "border-red/20 opacity-40" : "border-border"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {likelyFp ? <X size={12} className="text-red" /> : <CheckCircle size={12} className="text-green" />}
                    <span className="font-medium text-text text-[11px]">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${score * 100}%`, background: score > 0.7 ? "#00d4aa" : score > 0.4 ? "#f0b429" : "#e05a4f" }} />
                    </div>
                    <span className="text-[10px] text-text-dim">{Math.round(score * 100)}% real</span>
                  </div>
                  {f.reasoning && <div className="text-[10px] text-text-dim mt-1 italic">{f.reasoning}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 4: Scope Analysis */}
      {hasProgramScope && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text">Scope Analysis</span>
            <button onClick={runScope} disabled={loading === "scope"}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-white text-[10px] font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
              {loading === "scope" ? <Loader2 size={11} className="animate-spin" /> : null}
              {loading === "scope" ? "Analyzing..." : "Run Analysis"}
            </button>
          </div>
          {scopeResult && (
            <div className="space-y-2 text-xs text-text-dim bg-surface-2 rounded-lg p-3">
              <p className="text-text">{scopeResult.coverage_note}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-green-subtle/10 border border-green/20 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-green">{(scopeResult.in_scope_confirmed || []).length}</div>
                  <div className="text-[10px] text-text-dim">In Scope</div>
                </div>
                <div className="bg-red-subtle/10 border border-red/20 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-red">{(scopeResult.out_of_scope_flagged || []).length}</div>
                  <div className="text-[10px] text-text-dim">Out of Scope</div>
                </div>
              </div>
              {scopeResult.out_of_scope_flagged?.length > 0 && (
                <div>
                  <span className="text-red font-medium">Flagged (remove from scope)</span>
                  {scopeResult.out_of_scope_flagged.map((a, i) => (
                    <div key={i} className="text-[11px] font-mono text-text-dim mt-0.5">{a}</div>
                  ))}
                </div>
              )}
              {scopeResult.unclear?.length > 0 && (
                <div>
                  <span className="text-yellow font-medium">Unclear — needs review</span>
                  {scopeResult.unclear.map((a, i) => (
                    <div key={i} className="text-[11px] font-mono text-text-dim mt-0.5">{a}</div>
                  ))}
                </div>
              )}
              {scopeResult.high_value?.length > 0 && (
                <div>
                  <span className="text-accent font-medium">High Value Targets</span>
                  {scopeResult.high_value.map((a, i) => (
                    <div key={i} className="text-[11px] font-mono text-text-dim mt-0.5">{a}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
