import { useState, useEffect, useMemo } from "react";
import { X, Download, Copy, ChevronRight, Sparkles, Settings, Eye, FileText, Loader } from "lucide-react";
import toast from "react-hot-toast";
import { PLATFORMS, formatReport } from "../data/reportTemplates";
import { getAIConfig, saveAIConfig, clearAIConfig, enhanceFindings, generateExecutiveSummary } from "../services/aiService";

export default function ReportGenerator({ findings, targetUrl, onClose }) {
  const [step, setStep] = useState("configure");
  const [selectedIds, setSelectedIds] = useState(() => findings.map((f) => f._ts));
  const [platform, setPlatform] = useState("hackerone");
  const [useAI, setUseAI] = useState(false);
  const [aiConfig, setAIConfig] = useState(() => getAIConfig());
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("gpt-4o-mini");
  const [aiBaseUrl, setAiBaseUrl] = useState("https://api.openai.com/v1/chat/completions");
  const [aiProgress, setAiProgress] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [enhancedFindings, setEnhancedFindings] = useState(null);
  const [reportContent, setReportContent] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [livePreview, setLivePreview] = useState(false);

  const selected = findings.filter((f) => selectedIds.includes(f._ts));
  const activeFindings = enhancedFindings || selected;
  const platformData = PLATFORMS[platform];

  useEffect(() => {
    if (livePreview && activeFindings.length > 0) {
      setReportContent(formatReport(activeFindings, platform, targetUrl, !!enhancedFindings));
    }
  }, [livePreview, activeFindings, platform, targetUrl, enhancedFindings]);

  function toggleFinding(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleEnhance() {
    if (!aiConfig && !aiApiKey) {
      toast.error("Enter an AI API key first");
      return;
    }
    if (!aiConfig) {
      saveAIConfig({ apiKey: aiApiKey, model: aiModel, baseUrl: aiBaseUrl });
      setAIConfig({ apiKey: aiApiKey, model: aiModel, baseUrl: aiBaseUrl });
    }
    setEnhancing(true);
    setAiProgress("Starting AI enhancement...");
    enhanceFindings(selected, platform, targetUrl, setAiProgress)
      .then((enhanced) => {
        setEnhancedFindings(enhanced);
        setAiProgress("Enhancement complete");
        toast.success(`Enhanced ${enhanced.length} finding${enhanced.length > 1 ? "s" : ""}`);
      })
      .catch((err) => {
        toast.error(err.message);
        setAiProgress("");
      })
      .finally(() => setEnhancing(false));
  }

  function handleGenerate() {
    const content = formatReport(activeFindings, platform, targetUrl, !!enhancedFindings);
    setReportContent(content);
    setStep("preview");
    setLivePreview(true);
  }

  function handleCopy() {
    navigator.clipboard.writeText(reportContent)
      .then(() => toast.success("Report copied to clipboard"))
      .catch(() => toast.error("Failed to copy"));
  }

  function handleDownload() {
    const ext = platform === "generic" ? "md" : "md";
    const blob = new Blob([reportContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = targetUrl?.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "report";
    a.download = `${platform}-${name}-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  }

  const severityIcon = (s) => {
    const colors = { critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94" };
    return { background: colors[s] || colors.low };
  };

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <FileText size={18} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Report Generator</h2>
          {step === "configure" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 text-text-dim">Step 1: Configure</span>}
          {step === "preview" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-subtle text-accent">Step 2: Preview & Export</span>}
        </div>
        <button onClick={onClose} className="text-text-dim hover:text-text p-1"><X size={16} /></button>
      </div>

      {step === "configure" && (
        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold text-text mb-3 block">Platform</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(PLATFORMS).map(([key, p]) => {
                const active = platform === key;
                return (
                  <button key={key} onClick={() => setPlatform(key)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs transition-all ${active ? "border-accent bg-accent-subtle text-accent" : "border-border bg-surface-2 text-text-dim hover:border-border-light"}`}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
                      style={{ background: active ? `${p.color}22` : "var(--color-surface)", color: p.color }}>
                      {p.icon}
                    </div>
                    <span className="font-medium">{p.label}</span>
                    <span className="text-[9px] text-center leading-tight opacity-70">{p.description.slice(0, 60)}...</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-text">Findings ({selected.length}/{findings.length} selected)</label>
              <button onClick={() => setSelectedIds(selectedIds.length === findings.length ? [] : findings.map((f) => f._ts))}
                className="text-[10px] text-accent hover:underline">
                {selectedIds.length === findings.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {findings.map((f) => {
                const checked = selectedIds.includes(f._ts);
                return (
                  <label key={f._ts}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${checked ? "border-accent/40 bg-accent-subtle/20" : "border-border bg-surface-2 hover:border-border-light"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleFinding(f._ts)}
                      className="accent-accent w-3.5 h-3.5 rounded" />
                    <span className="w-2 h-2 rounded-full shrink-0" style={severityIcon(f.severity)} />
                    <span className="flex-1 min-w-0 truncate text-text">{f.title || "Untitled"}</span>
                    <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: `${severityIcon(f.severity).background}22`, color: severityIcon(f.severity).background }}>
                      {f.severity}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-yellow" />
                <span className="text-xs font-medium text-text">AI Enhancement</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={useAI} onChange={() => setUseAI(!useAI)}
                  className="sr-only peer" />
                <div className="w-8 h-4 bg-surface-2 rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
            {useAI && (
              <div className="space-y-2.5 pt-1">
                {!aiConfig ? (
                  <>
                    <p className="text-[10px] text-text-dim">Connect your own AI API key (OpenAI-compatible). Your key stays in your browser.</p>
                    <div>
                      <label className="text-[10px] text-text-dim block mb-1">API Endpoint</label>
                      <input value={aiBaseUrl} onChange={(e) => setAiBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1/chat/completions"
                        className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text outline-none focus:border-accent font-mono" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-dim block mb-1">Model</label>
                      <input value={aiModel} onChange={(e) => setAiModel(e.target.value)}
                        placeholder="gpt-4o-mini"
                        className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text outline-none focus:border-accent font-mono" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-dim block mb-1">API Key</label>
                      <input type="password" value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text outline-none focus:border-accent font-mono" />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green" />
                      <span className="text-[11px] text-text-dim">Connected ({aiConfig.model || "gpt-4o-mini"})</span>
                    </div>
                    <button onClick={() => { clearAIConfig(); setAIConfig(null); setUseAI(false); }}
                      className="text-[10px] text-red hover:underline">Disconnect</button>
                  </div>
                )}
                {aiConfig && selected.length > 0 && (
                  <button onClick={handleEnhance} disabled={enhancing}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-yellow-subtle text-yellow text-xs font-medium hover:bg-yellow/20 transition-colors disabled:opacity-50">
                    {enhancing ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {enhancing ? aiProgress : `Enhance ${selected.length} Finding${selected.length > 1 ? "s" : ""} with AI`}
                  </button>
                )}
                {enhancedFindings && (
                  <div className="flex items-center gap-2 text-[10px] text-green">
                    <span>✓ Enhanced</span>
                    <button onClick={() => setEnhancedFindings(null)}
                      className="text-text-dim hover:text-text underline">Reset to original</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button onClick={handleGenerate} disabled={selected.length === 0}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-accent text-white text-xs font-semibold rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-40">
            Generate Report
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-surface-2">
            <button onClick={() => { setStep("configure"); setLivePreview(false); }}
              className="text-[11px] text-text-dim hover:text-text transition-colors">
              &larr; Back to configure
            </button>
            <span className="text-text-dim/30">|</span>
            <span className="text-[11px] text-text-dim">{platformData?.label} &middot; {activeFindings.length} finding{activeFindings.length > 1 ? "s" : ""}{enhancedFindings ? " &middot; AI-enhanced" : ""}</span>
            <div className="flex-1" />
            <button onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-[10px] text-text-dim hover:text-text hover:border-border-light transition-colors">
              <Copy size={11} /> Copy
            </button>
            <button onClick={handleDownload}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-[10px] text-text-dim hover:text-text hover:border-border-light transition-colors">
              <Download size={11} /> Download .md
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto p-5">
            <pre className="text-[11px] font-mono text-text leading-relaxed whitespace-pre-wrap">{reportContent}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
