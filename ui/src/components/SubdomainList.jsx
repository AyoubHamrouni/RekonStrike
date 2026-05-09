import { useState, useEffect, useMemo } from "react";
import { fetchSubdomains } from "../api";
import { Globe, Search, ChevronDown, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

export default function SubdomainList({ data: initialData, targetId }) {
  const [data, setData] = useState(initialData || { items: [], total: 0 });
  const [search, setSearch] = useState("");
  const [resolvedFilter, setResolvedFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("subdomain");
  const [sortDir, setSortDir] = useState("asc");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setData(initialData || { items: [], total: 0 });
  }, [initialData]);

  const loadPage = async (p, sort, dir) => {
    setLoading(true);
    try {
      const params = {
        page: p, size: PAGE_SIZE,
        sort: sort || sortKey, order: dir || sortDir,
      };
      if (search) params.search = search;
      if (resolvedFilter !== "all") params.resolved = resolvedFilter === "yes" ? "true" : "false";
      const result = await fetchSubdomains(targetId, params);
      setData(result);
    } catch {} finally { setLoading(false); }
  };

  const handleSearch = () => {
    setPage(0);
    loadPage(0);
  };

  const changePage = (delta) => {
    const next = page + delta;
    if (next >= 0 && next < Math.ceil((data.total || 0) / PAGE_SIZE)) {
      setPage(next);
      loadPage(next);
    }
  };

  const toggleSort = (key) => {
    const dir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    setSortKey(key);
    setSortDir(dir);
    setPage(0);
    loadPage(0, key, dir);
  };

  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
  const items = data.items || [];

  if (!data.total && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Globe size={32} className="text-text-dim mb-3" />
        <p className="text-sm text-text-dim">No subdomains found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            placeholder="Search subdomains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text placeholder:text-text-dim/40 outline-none focus:border-accent transition-colors"
          />
        </div>
        <select value={resolvedFilter} onChange={(e) => { setResolvedFilter(e.target.value); setPage(0); loadPage(0); }}
          className="px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text outline-none focus:border-accent transition-colors">
          <option value="all">All</option>
          <option value="yes">Resolved</option>
          <option value="no">Unresolved</option>
        </select>
        <span className="text-xs text-text-dim">{data.total} results</span>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th onClick={() => toggleSort("subdomain")}
                  className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium cursor-pointer hover:text-text select-none">
                  <div className="flex items-center gap-1">
                    Subdomain
                    <ArrowUpDown size={11} className={sortKey === "subdomain" ? "text-accent" : ""} />
                  </div>
                </th>
                <th onClick={() => toggleSort("source")}
                  className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium cursor-pointer hover:text-text select-none">
                  <div className="flex items-center gap-1">
                    Source
                    <ArrowUpDown size={11} className={sortKey === "source" ? "text-accent" : ""} />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">
                  IP Address
                </th>
                <th onClick={() => toggleSort("resolved")}
                  className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium cursor-pointer hover:text-text select-none">
                  <div className="flex items-center gap-1">
                    Resolved
                    <ArrowUpDown size={11} className={sortKey === "resolved" ? "text-accent" : ""} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-dim text-sm">
                    Loading...
                  </td>
                </tr>
              ) : items.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-sm text-text">{s.subdomain}</td>
                  <td className="px-4 py-2.5 text-xs text-text-dim">{s.source || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-text-dim font-mono">{s.ip_address || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                      s.resolved ? "bg-green/10 text-green" : "bg-surface-2 text-text-dim"
                    }`}>
                      {s.resolved ? "Yes" : "No"}
                    </span>
                  </td>
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
          <span className="text-xs text-text-dim">
            Page {page + 1} of {totalPages}
          </span>
          <button onClick={() => changePage(1)} disabled={page >= totalPages - 1}
            className="p-2 rounded-lg bg-surface-2 border border-border hover:bg-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
