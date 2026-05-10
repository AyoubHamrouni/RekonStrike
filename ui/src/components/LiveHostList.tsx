import { useState, useEffect, useCallback } from "react";
import { Activity, Search, ArrowUpDown, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { fetchLiveHosts } from "../api";
import EmptyState from "./ui/EmptyState";
import ErrorState from "./ui/ErrorState";
import { SkeletonTable } from "./ui/Skeleton";
import type { LiveHost } from "../types";

const PAGE_SIZE = 50;

function StatusBadge({ code }: { code?: number }) {
  const color = code !== undefined && code >= 200 && code < 300 ? "text-green bg-green/10" :
    code !== undefined && code >= 300 && code < 400 ? "text-blue bg-blue/10" :
    code !== undefined && code >= 400 ? "text-red bg-red/10" :
    "text-text-dim bg-surface-2";
  return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${color}`}>{code ?? "—"}</span>;
}

function TechBadge({ tech }: { tech: string }) {
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded bg-surface-2 text-text-dim text-[10px] font-medium">
      {tech}
    </span>
  );
}

interface SortHeaderProps {
  field: string;
  children: React.ReactNode;
  currentField: string;
  onSort: (field: string) => void;
}

function SortHeader({ field, children, currentField, onSort }: SortHeaderProps) {
  return (
    <th
      className="px-5 py-3 text-left text-xs font-medium text-text-dim uppercase tracking-wider cursor-pointer hover:text-text select-none"
      onClick={() => onSort(field)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSort(field); }}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown size={11} className={currentField === field ? "text-accent" : "opacity-30"} />
      </div>
    </th>
  );
}

interface LiveHostListProps {
  targetId: number;
}

export default function LiveHostList({ targetId }: LiveHostListProps) {
  const [data, setData] = useState<{ items: LiveHost[]; total: number }>({ items: [], total: 0 });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ field: "roi_score", dir: "desc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params: Record<string, unknown> = { page, size: PAGE_SIZE };
    if (search) params.search = search;
    if (sort.field) {
      params.sort = sort.field;
      params.order = sort.dir;
    }
    fetchLiveHosts(targetId, params)
      .then((items) => setData({ items, total: items.length }))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [targetId, page, search, sort]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(0);
  }, []);

  const toggleSort = (field: string) => {
    setSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));
  };

  if (error) {
    return <ErrorState title="Failed to load live hosts" message={error} onRetry={load} />;
  }

  return (
    <div className="bg-surface border border-white/5 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <Activity size={16} className="text-accent" />
          Live Hosts
          {!loading && <span className="text-xs font-normal text-text-dim">({data.total})</span>}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Search hosts..."
            className="w-56 pl-8 pr-3 py-1.5 bg-surface-2 border border-white/5 rounded-lg text-xs text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent transition-colors"
            aria-label="Search hosts"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : !data.items.length ? (
        <EmptyState icon={Activity} title="No live hosts found"
          message={search ? "Try a different search term." : "Run HTTP probing (Phase 3) to discover live hosts."} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <SortHeader field="url" currentField={sort.field} onSort={toggleSort}>URL</SortHeader>
                  <SortHeader field="status_code" currentField={sort.field} onSort={toggleSort}>Status</SortHeader>
                  <th className="px-5 py-3 text-left text-xs font-medium text-text-dim uppercase tracking-wider">Title</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-text-dim uppercase tracking-wider">Tech</th>
                  <SortHeader field="roi_score" currentField={sort.field} onSort={toggleSort}>ROI</SortHeader>
                  <th className="px-5 py-3 text-left text-xs font-medium text-text-dim uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.items.map((h, i) => (
                  <tr key={h.id || i} className="hover:bg-white/[0.02] transition-colors animate-fade-in">
                    <td className="px-5 py-2.5 font-mono text-xs text-accent max-w-xs truncate">{h.url}</td>
                    <td className="px-5 py-2.5">
                      <StatusBadge code={h.status_code} />
                    </td>
                    <td className="px-5 py-2.5 text-xs text-text-dim max-w-[200px] truncate">{h.title || "—"}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(h.technologies || []).slice(0, 4).map((t, i) => (
                          <TechBadge key={i} tech={t} />
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">
                        {h.roi_score ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <a href={h.url} target="_blank" rel="noopener noreferrer"
                        className="text-text-dim hover:text-accent transition-colors inline-flex items-center">
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-text-dim">Page {page + 1} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="p-1.5 rounded hover:bg-surface-2 disabled:opacity-30 transition-colors" aria-label="Previous page">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                  className="p-1.5 rounded hover:bg-surface-2 disabled:opacity-30 transition-colors" aria-label="Next page">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
