import { useState, useEffect } from "react";
import { fetchEndpoints } from "../api";
import { BarChart3, Search, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

const PAGE_SIZE = 100;

export default function EndpointList({ data: initialData, targetId }) {
  const [data, setData] = useState(initialData || { items: [], total: 0 });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setData(initialData || { items: [], total: 0 });
  }, [initialData]);

  const loadPage = async (p) => {
    setLoading(true);
    try {
      const result = await fetchEndpoints(targetId, { page: p, size: PAGE_SIZE });
      const filtered = search
        ? { ...result, items: result.items.filter((e) =>
            e.url?.toLowerCase().includes(search.toLowerCase())
          )}
        : result;
      setData(filtered);
    } catch {} finally { setLoading(false); }
  };

  const changePage = (delta) => {
    const next = page + delta;
    if (next >= 0 && next < Math.ceil((data.total || 0) / PAGE_SIZE)) {
      setPage(next);
      loadPage(next);
    }
  };

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
  const items = data.items || [];

  if (!data.total && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 size={32} className="text-text-dim mb-3" />
        <p className="text-sm text-text-dim">No endpoints discovered yet. Run Phase 4 (Content Discovery) first.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            placeholder="Search endpoints..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text placeholder:text-text-dim/40 outline-none focus:border-accent transition-colors"
          />
        </div>
        <span className="text-xs text-text-dim">{data.total.toLocaleString()} results</span>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">URL</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">Method</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">Status</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">Type</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-dim text-sm">Loading...</td>
                </tr>
              ) : items.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2 font-mono text-xs text-text max-w-md truncate">
                    <a href={e.url} target="_blank" rel="noopener noreferrer"
                      className="hover:text-accent transition-colors inline-flex items-center gap-1">
                      {e.url}
                      <ExternalLink size={10} className="text-text-dim shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-mono font-medium text-text-dim">{e.method || "GET"}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-mono font-medium ${
                      e.status_code >= 200 && e.status_code < 300 ? "text-green" :
                      e.status_code >= 400 ? "text-red" : "text-text-dim"
                    }`}>{e.status_code || "—"}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-text-dim">{e.content_type || "—"}</td>
                  <td className="px-4 py-2 text-xs text-text-dim">{e.source || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={() => changePage(-1)} disabled={page === 0}
            className="p-2 rounded-lg bg-surface-2 border border-border hover:bg-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-text-dim">Page {page + 1} of {totalPages}</span>
          <button onClick={() => changePage(1)} disabled={page >= totalPages - 1}
            className="p-2 rounded-lg bg-surface-2 border border-border hover:bg-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
