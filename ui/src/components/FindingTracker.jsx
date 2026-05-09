import { useState, useEffect } from "react";
import { X, Edit2, Trash2, Copy, Shield, Download, FileText, Sparkles, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import ReportGenerator from "./ReportGenerator";
import { fetchVulnerabilities, aiReport } from "../api";

const severityColors = { critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94" };

function exportSingleH1Report(finding, targetUrl) {
  const lines = [
    `# Summary`,
    ``,
    `${finding.title || "Untitled Finding"}`,
    ``,
    `## Severity`,
    ``,
    `${(finding.severity || "medium").toUpperCase()}`,
    ``,
    `## Affected URL`,
    ``,
    `${finding.url || targetUrl}`,
    ``,
    `## Steps to Reproduce`,
    ``,
    `${finding.steps || "N/A"}`,
    ``,
    `## Impact`,
    ``,
    `${finding.impact || "N/A"}`,
    ``,
    `## Request`,
    ``,
    "```",
    `${finding.request || "N/A"}`,
    "```",
    ``,
    `## Response`,
    ``,
    "```",
    `${finding.response || "N/A"}`,
    "```",
  ];
  return lines.join("\n");
}

function EditModal({ finding, onSave, onClose }) {
  const [form, setForm] = useState({ ...finding });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border border-border rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Edit Finding</h3>
          <button onClick={onClose} className="text-text-dim hover:text-text p-1"><X size={16} /></button>
        </div>
        <div>
          <label className="text-xs text-text-dim block mb-1">Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </div>
        <div>
          <label className="text-xs text-text-dim block mb-1">Affected URL</label>
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </div>
        <div>
          <label className="text-xs text-text-dim block mb-1">Severity</label>
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent">
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-text-dim block mb-1">Steps to Reproduce</label>
          <textarea value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} rows={3}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none" />
        </div>
        <div>
          <label className="text-xs text-text-dim block mb-1">Impact</label>
          <textarea value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} rows={2}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none" />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={() => { onSave(form); onClose(); }}
            className="px-4 py-2 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors">
            Save
          </button>
          <button onClick={onClose}
            className="px-4 py-2 bg-surface-2 text-text-dim text-xs font-medium rounded-lg hover:text-text transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FindingTracker({ targetId, targetUrl, onClose, standalone = true }) {
  const [findings, setFindings] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showReportGen, setShowReportGen] = useState(false);
  const [serverVulns, setServerVulns] = useState([]);
  const [showServerVulns, setShowServerVulns] = useState(false);
  const [reportModal, setReportModal] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportPlatform, setReportPlatform] = useState("HackerOne");
  const storageKey = `findings_${targetId}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setFindings(raw ? JSON.parse(raw) : []);
    } catch { setFindings([]); }
  }, [storageKey]);

  function saveFindings(updated) {
    setFindings(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }

  async function loadServerVulns() {
    try {
      const r = await fetchVulnerabilities(targetId, { size: 200 });
      setServerVulns(r.items || []);
      setShowServerVulns(true);
      if (!r.items?.length) toast("No server vulnerabilities found");
    } catch (e) { toast.error("Failed to load server vulns"); }
  }

  async function handleDraftReport(vulnId) {
    setReportLoading(true);
    setReportModal(vulnId);
    setReportText("");
    try {
      const r = await aiReport(targetId, { vulnerability_id: vulnId, platform: reportPlatform });
      setReportText(r.report || "");
    } catch (e) { toast.error(e.message); }
    finally { setReportLoading(false); }
  }

  function copyReport() {
    navigator.clipboard.writeText(reportText).then(() => toast.success("Report copied")).catch(() => toast.error("Copy failed"));
  }

  function handleDelete(idx) {
    const updated = findings.filter((_, i) => i !== idx);
    saveFindings(updated);
    toast.success("Finding deleted");
  }

  function handleEdit(updated) {
    const idx = findings.findIndex((f) => f._ts === updated._ts);
    if (idx >= 0) {
      const updatedList = [...findings];
      updatedList[idx] = updated;
      saveFindings(updatedList);
      toast.success("Finding updated");
    }
  }

  function handleExportSingle(finding) {
    const report = exportSingleH1Report(finding, targetUrl);
    navigator.clipboard.writeText(report)
      .then(() => toast.success("H1 report copied to clipboard"))
      .catch(() => toast.error("Failed to copy"));
  }

  if (showReportGen) {
    return (
      <ReportGenerator
        findings={findings}
        targetUrl={targetUrl}
        onClose={() => setShowReportGen(false)}
      />
    );
  }

  return (
    <div className={`${standalone ? "bg-surface border border-border rounded-xl p-6" : ""} space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Finding Tracker</h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-subtle text-accent">{findings.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {findings.length > 0 && (
            <>
              <button onClick={() => setShowReportGen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent text-white text-[10px] font-medium hover:bg-accent-hover transition-colors">
                <FileText size={11} />
                Generate Report
              </button>
              <button onClick={() => { setShowReportGen(true); }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-[10px] text-text-dim hover:text-text hover:border-border-light transition-colors">
                <Download size={11} />
                Export
              </button>
            </>
          )}
          <button onClick={loadServerVulns}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent-subtle text-accent text-[10px] font-medium hover:bg-accent/20 transition-colors">
            <Sparkles size={11} />
            AI Draft Report
          </button>
          {onClose && (
            <button onClick={onClose} className="text-text-dim hover:text-text p-1"><X size={16} /></button>
          )}
        </div>
      </div>

      {findings.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs text-text-dim">No findings saved yet.</p>
          <p className="text-[11px] text-text-dim/60 mt-1">Use Manual Testing to discover and record findings.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {findings.map((f, i) => (
            <div key={f._ts || i} className="bg-surface-2 border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: severityColors[f.severity] || severityColors.low }} />
                  <span className="text-sm font-medium text-text truncate">{f.title}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: `${severityColors[f.severity] || severityColors.low}22`, color: severityColors[f.severity] || severityColors.low }}>
                    {f.severity}
                  </span>
                </div>
              </div>
              {f.url && <div className="text-[11px] text-text-dim truncate">{f.url}</div>}
              {f.module && <div className="text-[10px] text-text-dim/60">Module: {f.module}</div>}
              {f._aiEnhanced && (
                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-yellow-subtle/30 text-yellow">
                  AI-enhanced
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setEditing(f)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-dim hover:text-text hover:bg-border transition-colors">
                  <Edit2 size={11} /> Edit
                </button>
                <button onClick={() => handleExportSingle(f)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-dim hover:text-text hover:bg-border transition-colors">
                  <Copy size={11} /> Copy H1
                </button>
                <button onClick={() => handleDelete(i)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-red hover:bg-red-subtle transition-colors">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          finding={editing}
          onSave={handleEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {showServerVulns && (
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-text flex items-center gap-1">
              <Sparkles size={13} className="text-accent" />
              Server Vulnerabilities — AI Draft Report
            </h3>
            <div className="flex items-center gap-2">
              <select value={reportPlatform} onChange={(e) => setReportPlatform(e.target.value)}
                className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-[10px] text-text outline-none">
                <option value="HackerOne">HackerOne</option>
                <option value="Bugcrowd">Bugcrowd</option>
                <option value="Intigriti">Intigriti</option>
              </select>
              <button onClick={() => setShowServerVulns(false)} className="text-text-dim hover:text-text p-0.5"><X size={14} /></button>
            </div>
          </div>
          {serverVulns.length === 0 ? (
            <p className="text-xs text-text-dim">No server vulnerabilities found.</p>
          ) : (
            <div className="space-y-2">
              {serverVulns.map((v) => (
                <div key={v.id} className="bg-surface-2 border border-border rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: severityColors[v.severity] || severityColors.low }} />
                    <span className="text-xs text-text truncate">{v.name}</span>
                    <span className="text-[10px] uppercase font-semibold px-1 py-0.5 rounded"
                      style={{ background: `${severityColors[v.severity] || severityColors.low}22`, color: severityColors[v.severity] || severityColors.low }}>
                      {v.severity}
                    </span>
                  </div>
                  <button onClick={() => handleDraftReport(v.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-accent-subtle text-accent hover:bg-accent/20 transition-colors">
                    {reportLoading && reportModal === v.id ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    Draft Report
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Report Modal */}
      {reportModal && reportText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-text">AI Draft Report — {reportPlatform}</h3>
              <button onClick={() => { setReportModal(null); setReportText(""); }}
                className="text-text-dim hover:text-text p-1"><X size={16} /></button>
            </div>
            <textarea value={reportText} onChange={(e) => setReportText(e.target.value)}
              className="flex-1 p-4 text-xs text-text font-mono bg-surface outline-none resize-none min-h-[300px]" />
            <div className="flex items-center gap-2 p-4 border-t border-border">
              <button onClick={copyReport}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors">
                <Copy size={12} /> Copy to Clipboard
              </button>
              <button onClick={() => { setReportModal(null); setReportText(""); }}
                className="px-3 py-1.5 rounded-lg bg-surface-2 text-text-dim text-xs font-medium hover:text-text transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
