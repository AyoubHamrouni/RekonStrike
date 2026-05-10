import { useState, useEffect, useCallback } from "react";
import { BarChart3, Search, ChevronLeft, ChevronRight, ExternalLink, ArrowUpDown } from "lucide-react";
import { fetchEndpoints } from "../api";
import EmptyState from "./ui/EmptyState";
import ErrorState from "./ui/ErrorState";
import { SkeletonTable } from "./ui/Skeleton";
import type { Endpoint } from "../types";

const PAGE_SIZE = 100;

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

interface EndpointListProps {
  targetId: number;
}

export default function EndpointList({ targetId }: EndpointListProps) {
  const [data, setData] = useState<{ items: Endpoint[]; total: number }>({ items: [], total: 0 });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ field: "url", dir: "asc" });
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
    fetchEndpoints(targetId, params)
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
    return <ErrorState title="Failed to load endpoints" message={error} onRetry={load} />;
  }

  return (
    <div className="bg-surface border border-white/5 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <BarChart3 size={16} className="text-accent" />
          Endpoints
          {!loading && <span className="text-xs font-normal text-text-dim">({data.total.toLocaleString()})</span>}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Search endpoints..."
            className="w-56 pl-8 pr-3 py-1.5 bg-surface-2 border border-white/5 rounded-lg text-xs text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent transition-colors"
            aria-label="Search endpoints"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : !data.items.length ? (
        <EmptyState icon={BarChart3} title="No endpoints discovered"
          message={search ? "Try a different search term." : "Run Phase 4 (Content Discovery) to crawl and fuzz for endpoints."} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <SortHeader field="url" currentField={sort.field} onSort={toggleSort}>URL</SortHeader>
                  <SortHeader field="method" currentField={sort.field} onSort={toggleSort}>Method</SortHeader>
                  <SortHeader field="status_code" currentField={sort.field} onSort={toggleSort}>Status</SortHeader>
                  <th className="px-5 py-3 text-left text-xs font-medium text-text-dim uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-text-dim uppercase tracking-wider">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.items.map((e, i) => (
                  <tr key={e.id || i} className="hover:bg-white/[0.02] transition-colors animate-fade-in">
                    <td className="px-5 py-2.5 font-mono text-xs text-text max-w-md truncate">
                      <a href={e.url} target="_blank" rel="noopener noreferrer"
                        className="hover:text-accent transition-colors inline-flex items-center gap-1">
                        {e.url}
                        <ExternalLink size={10} className="text-text-dim shrink-0" />
                      </a>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="text-[10px] font-mono font-medium text-text-dim">{e.method || "GET"}</span>
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`text-[10px] font-mono font-medium ${
                        e.status_code !== undefined && e.status_code >= 200 && e.status_code < 300 ? "text-green" :
                        e.status_code !== undefined && e.status_code >= 400 ? "text-red" : "text-text-dim"
                      }`}>{e.status_code ?? "—"}</span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-text-dim">{e.content_type || "—"}</td>
                    <td className="px-5 py-2.5 text-xs text-text-dim">{e.source || "—"}</td>
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
