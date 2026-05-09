import { useState, useEffect } from "react";
import { fetchLiveHosts } from "../api";
import { Activity, Search, ExternalLink, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";

const PAGE_SIZE = 50;

function StatusBadge({ code }) {
  const color = code >= 200 && code < 300 ? "text-green bg-green/10" :
    code >= 300 && code < 400 ? "text-blue bg-blue/10" :
    code >= 400 ? "text-red bg-red/10" :
    "text-text-dim bg-surface-2";
  return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${color}`}>{code}</span>;
}

function TechBadge({ tech }) {
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded bg-surface-2 text-text-dim text-[10px] font-medium">
      {tech}
    </span>
  );
}

export default function LiveHostList({ data: initialData, targetId }) {
  const [data, setData] = useState(initialData || { items: [], total: 0 });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("roi_score");
  const [sortDir, setSortDir] = useState("desc");
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
      const result = await fetchLiveHosts(targetId, params);
      const filtered = search
        ? { ...result, items: result.items.filter((h) =>
            h.url?.toLowerCase().includes(search.toLowerCase()) ||
            h.title?.toLowerCase().includes(search.toLowerCase())
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
        <Activity size={32} className="text-text-dim mb-3" />
        <p className="text-sm text-text-dim">No live hosts found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            placeholder="Search URL or title..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text placeholder:text-text-dim/40 outline-none focus:border-accent transition-colors"
          />
        </div>
        <span className="text-xs text-text-dim">{data.total} results</span>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th onClick={() => toggleSort("url")}
                  className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium cursor-pointer hover:text-text select-none">
                  <div className="flex items-center gap-1">
                    URL <ArrowUpDown size={11} className={sortKey === "url" ? "text-accent" : ""} />
                  </div>
                </th>
                <th onClick={() => toggleSort("status_code")}
                  className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium cursor-pointer hover:text-text select-none">
                  <div className="flex items-center gap-1">
                    Status <ArrowUpDown size={11} className={sortKey === "status_code" ? "text-accent" : ""} />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">
                  Title
                </th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">
                  Tech
                </th>
                <th onClick={() => toggleSort("roi_score")}
                  className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium cursor-pointer hover:text-text select-none">
                  <div className="flex items-center gap-1">
                    ROI <ArrowUpDown size={11} className={sortKey === "roi_score" ? "text-accent" : ""} />
                  </div>
                </th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-text-dim font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-dim text-sm">Loading...</td>
                </tr>
              ) : items.map((h) => (
                <tr key={h.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-accent max-w-xs truncate">
                    {h.url}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge code={h.status_code} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-text-dim max-w-[200px] truncate">
                    {h.title || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(h.technologies || []).slice(0, 4).map((t, i) => (
                        <TechBadge key={i} tech={t} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">
                      {h.roi_score ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <a href={h.url} target="_blank" rel="noopener noreferrer"
                      className="text-text-dim hover:text-accent transition-colors">
                      <ExternalLink size={14} />
                    </a>
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
