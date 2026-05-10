import { useState } from "react";
import { Search, Copy, ExternalLink, X, ChevronDown, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { PAYLOADS } from "../data/payloads";

interface PayloadItem {
  payload: string;
  notes: string;
  context: string;
}

const categoryLabels: Record<string, string> = {
  xss_reflected: "Reflected XSS",
  xss_stored: "Stored XSS",
  sqli_error: "Error-Based SQLi",
  sqli_blind: "Blind SQLi",
  ssti: "SSTI",
  ssrf_internal: "SSRF — Internal",
  ssrf_cloud: "SSRF — Cloud Metadata",
  xxe: "XXE",
  path_traversal: "Path Traversal",
  open_redirect: "Open Redirect",
};

interface PayloadLibraryProps {
  category?: string;
  targetUrl?: string;
  onClose?: () => void;
}

export default function PayloadLibrary({ category, targetUrl, onClose }: PayloadLibraryProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const payloads: PayloadItem[] = PAYLOADS[category || ""] || [];
  const filtered = search
    ? payloads.filter((p) =>
        p.payload.toLowerCase().includes(search.toLowerCase()) ||
        p.notes.toLowerCase().includes(search.toLowerCase()) ||
        p.context.toLowerCase().includes(search.toLowerCase())
      )
    : payloads;

  function handleCopy(payload: string) {
    navigator.clipboard.writeText(payload)
      .then(() => toast.success("Payload copied"))
      .catch(() => toast.error("Failed to copy"));
  }

  function handleTest(payload: string) {
    if (!targetUrl) return;
    const base = targetUrl.replace(/\/+$/, "");
    const testUrl = `${base}?q=${encodeURIComponent(payload)}`;
    window.open(testUrl, "_blank", "noopener");
  }

  return (
    <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text uppercase tracking-wider">
            {categoryLabels[category || ""] || category}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-subtle text-accent">{payloads.length}</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-text-dim hover:text-text p-0.5">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 bg-surface border border-white/5 rounded-lg px-3 py-1.5">
          <Search size={13} className="text-text-dim shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter payloads..."
            className="bg-transparent text-xs text-text outline-none w-full placeholder:text-text-dim/50"
          />
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-text-dim">No payloads match your filter.</div>
        ) : (
          filtered.map((p, i) => (
            <div key={i} className="px-4 py-2.5 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <code className="text-[11px] font-mono text-text break-all leading-relaxed">{p.payload}</code>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-subtle text-blue font-medium shrink-0">
                    {p.context}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-dim/70 truncate">{p.notes}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleCopy(p.payload)}
                    className="p-1 rounded hover:bg-white/5 text-text-dim hover:text-text transition-colors"
                    title="Copy payload">
                    <Copy size={12} />
                  </button>
                  {targetUrl && (
                    <button onClick={() => handleTest(p.payload)}
                      className="p-1 rounded hover:bg-white/5 text-accent hover:text-accent-hover transition-colors"
                      title="Test on target URL">
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export { categoryLabels };
