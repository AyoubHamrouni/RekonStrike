"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  Search,
  Bot,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/Shared";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchTargets, fetchVulnerabilities, aiTriage } from "@/lib/api";
import type { Target, Vulnerability } from "@/types";

interface EnrichedFinding extends Vulnerability {
  targetDomain?: string;
  targetId?: number;
  aiAnalysis?: string;
}

export default function FindingsPage() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [findings, setFindings] = useState<EnrichedFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [selectedFinding, setSelectedFinding] = useState<EnrichedFinding | null>(null);
  const [aiLoading, setAiLoading] = useState<Set<number>>(new Set());
  const [aiResults, setAiResults] = useState<Record<number, string>>({});

  useEffect(() => {
    setLoading(true);
    fetchTargets()
      .then(async (ts) => {
        setTargets(ts);
        const allFindings: EnrichedFinding[] = [];
        await Promise.all(
          ts.map(async (t) => {
            try {
              const vulns = await fetchVulnerabilities(t.id, { limit: 100 });
              vulns.items.forEach((v) => {
                allFindings.push({
                  ...v,
                  targetDomain: t.target,
                  targetId: t.id,
                });
              });
            } catch {
              // skip targets that error
            }
          })
        );
        allFindings.sort((a, b) => {
          const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
          return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
        });
        setFindings(allFindings);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAiAnalyze = useCallback(
    async (finding: EnrichedFinding) => {
      if (!finding.targetId) return;
      const key = finding.id;
      setAiLoading((prev) => new Set(prev).add(key));
      try {
        const result = await aiTriage(finding.targetId, {
          finding: finding.name || finding.template_id,
          severity: finding.severity,
          matched_at: finding.matched_at,
        });
        const text: string =
          typeof result === "object" && result !== null
            ? String(
                (result as Record<string, unknown>).analysis ||
                  (result as Record<string, unknown>).guidance ||
                  JSON.stringify(result)
              )
            : String(result);
        setAiResults((prev) => ({ ...prev, [key]: text }));
      } catch {
        setAiResults((prev) => ({ ...prev, [key]: "AI analysis unavailable" }));
      } finally {
        setAiLoading((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    []
  );

  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };

  const filtered = findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (f.name || f.template_id || "").toLowerCase();
      const target = (f.targetDomain || "").toLowerCase();
      if (!name.includes(q) && !target.includes(q)) return false;
    }
    return true;
  });

  const severityColor = (s: string) => {
    switch (s) {
      case "critical":
        return "danger";
      case "high":
        return "danger";
      case "medium":
        return "warning";
      case "low":
        return "default";
      default:
        return "default";
    }
  };

  const tabs = [
    { id: "all" as const, label: "All", count: findings.length },
    { id: "critical" as const, label: "Critical", count: findings.filter((f) => f.severity === "critical").length },
    { id: "high" as const, label: "High", count: findings.filter((f) => f.severity === "high").length },
    { id: "medium" as const, label: "Medium", count: findings.filter((f) => f.severity === "medium").length },
    { id: "low" as const, label: "Low", count: findings.filter((f) => f.severity === "low").length },
  ];
  const activeTab = severityFilter === "all" ? "all" : (severityFilter as "all" | "critical" | "high" | "medium" | "low");

  if (error) {
    return (
      <EmptyState
        icon={<ShieldAlert size={24} />}
        title="Failed to load findings"
        description={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200">Findings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {findings.length} finding{findings.length !== 1 ? "s" : ""} across {targets.length} target{targets.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && findings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["critical", "high", "medium", "low"] as const).map((sev) => {
            const count = findings.filter((f) => f.severity === sev).length;
            return (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev === severityFilter ? "all" : sev)}
                className={`rounded-xl p-4 border text-left transition-all cursor-pointer ${
                  severityFilter === sev
                    ? "bg-purple-600/10 border-purple-600/30"
                    : "bg-surface border-white/5 hover:border-white/10"
                }`}
              >
                <div className="text-2xl font-black text-slate-100">{count}</div>
                <div className="text-[10px] uppercase tracking-wider mt-1 capitalize"
                     style={{ color: sev === "critical" || sev === "high" ? "#f87171" : sev === "medium" ? "#fbbf24" : "#94a3b8" }}>
                  {sev}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter */}
      <Tabs tabs={tabs} active={activeTab} onChange={(id) => setSeverityFilter(id)} />

      {/* Search */}
      {findings.length > 0 && (
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search findings..."
            className="w-full bg-slate-900/50 border border-white/5 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-600/40 transition-all"
          />
        </div>
      )}

      {/* Findings list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={24} />}
          title={
            search || severityFilter !== "all"
              ? "No findings match your filters"
              : "No findings yet"
          }
          description={
            search || severityFilter !== "all"
              ? "Try adjusting your search or filter"
              : "Run an agent or scan to discover vulnerabilities"
          }
          action={
            <Button variant="primary" size="sm" onClick={() => { setSearch(""); setSeverityFilter("all"); }}>
              Clear Filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <div
              key={`${f.targetId}-${f.id}`}
              className="bg-surface border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-all"
            >
              <button
                onClick={() =>
                  setSelectedFinding(
                    selectedFinding?.id === f.id && selectedFinding?.targetId === f.targetId
                      ? null
                      : f
                  )
                }
                className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      f.severity === "critical" || f.severity === "high"
                        ? "bg-rose-500"
                        : f.severity === "medium"
                          ? "bg-amber-500"
                          : "bg-slate-600"
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-200 truncate block">
                      {f.name || f.template_id || "Unknown finding"}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-600">
                        {f.targetDomain}
                      </span>
                      {f.matched_at && (
                        <span className="text-[10px] text-slate-600 font-mono">
                          {f.matched_at}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={severityColor(f.severity)}>{f.severity}</Badge>
                  {f.confidence !== undefined && (
                    <span className="text-[10px] text-slate-600">
                      {(f.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`text-slate-600 transition-transform ${
                      selectedFinding?.id === f.id && selectedFinding?.targetId === f.targetId
                        ? "rotate-180"
                        : ""
                    }`}
                  />
                </div>
              </button>

              {/* Expanded detail */}
              {selectedFinding?.id === f.id && selectedFinding?.targetId === f.targetId && (
                <div className="px-5 pb-4 pt-0 border-t border-white/5 animate-slide-up">
                  {f.description && (
                    <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                      {f.description}
                    </p>
                  )}

                  {/* AI Analysis */}
                  <div className="mt-4">
                    {aiResults[f.id] ? (
                      <div className="bg-purple-600/5 border border-purple-600/15 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Bot size={14} className="text-purple-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                            AI Analysis
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {aiResults[f.id]}
                        </p>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Bot size={12} />}
                        loading={aiLoading.has(f.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAiAnalyze(f);
                        }}
                      >
                        {aiLoading.has(f.id) ? "Analyzing..." : "AI Triage"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
