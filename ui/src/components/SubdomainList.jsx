import { useState, useEffect, useCallback } from "react";
import { Globe, Search, ArrowUpDown, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw } from "lucide-react";
import { fetchSubdomains } from "../api";
import EmptyState from "./ui/EmptyState";
import ErrorState from "./ui/ErrorState";
import { SkeletonTable } from "./ui/Skeleton";

const PAGE_SIZE = 50;

export default function SubdomainList({ targetId }) {
  const [data, setData] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ field: "", dir: "asc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = { page, size: PAGE_SIZE };
    if (search) params.search = search;
    if (sort.field) {
      params.sort = sort.field;
      params.order = sort.dir;
    }
    fetchSubdomains(targetId, params)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [targetId, page, search, sort]);

  useEffect(load, [load]);

  const handleSearch = useCallback((e) => {
    const val = e.target.value;
    setSearch(val);
    setPage(0);
  }, []);

  const toggleSort = (field) => {
    setSort((s) => ({ field, dir: s.field === field && s.dir === "asc" ? "desc" : "asc" }));
  };

  const SortHeader = ({ field, children }) => (
    <th
      className="px-5 py-3 text-left text-xs font-medium text-text-dim uppercase tracking-wider cursor-pointer hover:text-text select-none"
      onClick={() => toggleSort(field)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleSort(field); }}
      aria-sort={sort.field === field ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown size={11} className={sort.field === field ? "text-accent" : "opacity-30"} />
      </div>
    </th>
  );

  if (error) {
    return <ErrorState title="Failed to load subdomains" message={error} onRetry={load} />;
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          <Globe size={16} className="text-accent" />
          Subdomains
          {!loading && <span className="text-xs font-normal text-text-dim">({data.total})</span>}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Search subdomains..."
            className="w-56 pl-8 pr-3 py-1.5 bg-surface-2 border border-border rounded-lg text-xs text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent transition-colors"
            aria-label="Search subdomains"
          />
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={4} />
      ) : !data.items.length ? (
        <EmptyState icon={Globe} title="No subdomains found"
          message={search ? "Try a different search term." : "Run a passive reconnaissance scan to discover subdomains."} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-border">
                  <SortHeader field="subdomain">Subdomain</SortHeader>
                  <SortHeader field="source">Source</SortHeader>
                  <th className="px-5 py-3 text-left text-xs font-medium text-text-dim uppercase tracking-wider">Resolved</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-text-dim uppercase tracking-wider">First Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((s, i) => (
                  <tr key={s.id || i} className="hover:bg-surface-2 transition-colors animate-fade-in">
                    <td className="px-5 py-2.5 text-sm text-text font-medium">{s.subdomain || s.name}</td>
                    <td className="px-5 py-2.5 text-sm text-text-dim">{s.source || "—"}</td>
                    <td className="px-5 py-2.5">
                      {s.resolved !== undefined ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${s.resolved ? "bg-green/10 text-green" : "bg-surface-2 text-text-dim"}`}>
                          {s.resolved ? "Yes" : "No"}
                        </span>
                      ) : (
                        <span className="text-xs text-text-dim">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-sm text-text-dim text-right">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-text-dim">
                Page {page + 1} of {totalPages}
              </span>
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
