"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  Search,
  Bot,
  ChevronDown,
  Globe,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/Shared";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchTargets, fetchVulnerabilities, aiTriage } from "@/lib/api";
import { relativeTime, severityColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Target, Vulnerability } from "@/types";
import toast from "react-hot-toast";

interface EnrichedFinding extends Vulnerability {
  targetDomain?: string;
  targetId?: number;
}

export default function VulnerabilitiesPage() {
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
    async function loadFindings() {
      setLoading(true);
      setError(null);
      try {
        const ts = await fetchTargets();
        setTargets(ts);
        const allFindings: EnrichedFinding[] = [];
        
        await Promise.all(
          ts.map(async (t) => {
            try {
              const vulns = await fetchVulnerabilities(t.id, { limit: 100 });
              if (vulns?.items) {
                vulns.items.forEach((v: Vulnerability) => {
                  allFindings.push({
                    ...v,
                    targetDomain: t.target,
                    targetId: t.id,
                  });
                });
              }
            } catch {
              // skip failed target fetch
            }
          })
        );

        allFindings.sort((a, b) => {
          const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
          return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
        });

        setFindings(allFindings);
      } catch (e: any) {
        setError(e.message || "Failed to load findings");
      } finally {
        setLoading(false);
      }
    }

    loadFindings();
  }, []);

  const handleAiAnalyze = useCallback(async (finding: EnrichedFinding) => {
    if (!finding.targetId) return;
    const key = finding.id;
    setAiLoading((prev) => new Set(prev).add(key));
    try {
      const result = await aiTriage(finding.targetId, {
        finding: finding.name || finding.template_id,
        severity: finding.severity,
        matched_at: finding.matched_at,
      });
      const text =
        typeof result === "object" && result !== null
          ? String(
              (result as any).analysis ||
                (result as any).guidance ||
                JSON.stringify(result)
            )
          : String(result);
      setAiResults((prev) => ({ ...prev, [key]: text }));
      toast.success("AI Triage complete");
    } catch {
      setAiResults((prev) => ({ ...prev, [key]: "AI analysis temporarily unavailable." }));
      toast.error("AI Triage failed");
    } finally {
      setAiLoading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const filtered = findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (f.name || f.template_id || "").toLowerCase();
      const target = (f.targetDomain || "").toLowerCase();
      const match = (f.matched_at || "").toLowerCase();
      if (!name.includes(q) && !target.includes(q) && !match.includes(q)) return false;
    }
    return true;
  });

  const tabs = [
    { id: "all" as const, label: "All", count: findings.length },
    { id: "critical" as const, label: "Critical", count: findings.filter((f) => f.severity === "critical").length },
    { id: "high" as const, label: "High", count: findings.filter((f) => f.severity === "high").length },
    { id: "medium" as const, label: "Medium", count: findings.filter((f) => f.severity === "medium").length },
    { id: "low" as const, label: "Low", count: findings.filter((f) => f.severity === "low").length },
  ];

  if (error) {
    return (
      <EmptyState
        icon={<ShieldAlert size={24} />}
        title="Failed to load vulnerabilities"
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
      {/* Header */}
      <div>
        <div className="label-eyebrow">latest security findings</div>
        <h1 className="text-2xl font-black text-white tracking-tight mt-1">Vulnerabilities</h1>
        <p className="text-sm text-dim mt-1">
          {findings.length} total findings across {targets.length} targets. Real-time correlation.
        </p>
      </div>

      {/* Summary Cards */}
      {!loading && findings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["critical", "high", "medium", "low"] as const).map((sev) => {
            const count = findings.filter((f) => f.severity === sev).length;
            return (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev === severityFilter ? "all" : sev)}
                className={cn(
                  "rounded-xl p-4 border text-left transition-all cursor-pointer card-hover",
                  severityFilter === sev
                    ? "bg-purple-600/10 border-purple-600/30 ring-1 ring-purple-600/20"
                    : "bg-surface border-white/5"
                )}
              >
                <div className="text-2xl font-black text-white">{count}</div>
                <div
                  className="text-[10px] uppercase tracking-wider mt-1 font-bold capitalize"
                  style={{
                    color:
                      sev === "critical" || sev === "high"
                        ? "#dc2626"
                        : sev === "medium"
                          ? "#eab308"
                          : "#3b82f6",
                  }}
                >
                  {sev}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Tabs */}
      <Tabs
        tabs={tabs}
        active={severityFilter as any}
        onChange={(id) => setSeverityFilter(id)}
      />

      {/* Search Filter */}
      {findings.length > 0 && (
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter vulnerabilities by target, title or match URL..."
            className="w-full bg-slate-900/50 border border-white/5 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-600/40 transition-all font-mono"
          />
        </div>
      )}

      {/* Findings list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl animate-shimmer" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={24} />}
          title={search || severityFilter !== "all" ? "No matches found" : "No vulnerabilities"}
          description={
            search || severityFilter !== "all"
              ? "Try adjusting your filters or search keywords."
              : "Launch active scanning templates or run the autonomous agent to discover findings."
          }
          action={
            search || severityFilter !== "all" ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSeverityFilter("all");
                }}
              >
                Reset Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => {
            const isSelected = selectedFinding?.id === f.id && selectedFinding?.targetId === f.targetId;
            return (
              <div
                key={`${f.targetId}-${f.id}`}
                className="bg-surface border border-white/5 rounded-xl overflow-hidden hover:border-white/10 transition-all card-border"
              >
                <button
                  onClick={() => setSelectedFinding(isSelected ? null : f)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span
                        className={cn(
                          "absolute inline-flex h-full w-full rounded-full animate-ping opacity-75",
                          f.severity === "critical" || f.severity === "high"
                            ? "bg-red/40"
                            : f.severity === "medium"
                              ? "bg-yellow/40"
                              : "bg-blue/40"
                        )}
                      />
                      <span
                        className={cn(
                          "relative inline-flex rounded-full h-2 w-2",
                          f.severity === "critical" || f.severity === "high"
                            ? "bg-red"
                            : f.severity === "medium"
                              ? "bg-yellow"
                              : "bg-blue"
                        )}
                      />
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-slate-200 truncate block">
                        {f.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                          <Globe size={10} /> {f.targetDomain}
                        </span>
                        {f.matched_at && (
                          <>
                            <span className="text-[10px] text-slate-600 font-mono">·</span>
                            <span className="text-[10px] text-slate-600 font-mono truncate max-w-[250px]">
                              {f.matched_at}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", severityColor(f.severity))}>
                      {f.severity}
                    </span>
                    {f.confidence !== undefined && (
                      <span className="text-[10px] text-slate-500 font-bold">
                        {(f.confidence * 100).toFixed(0)}% conf
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      className={cn("text-slate-600 transition-transform duration-200", isSelected && "rotate-180")}
                    />
                  </div>
                </button>

                {/* Collapsible card content */}
                {isSelected && (
                  <div className="px-5 pb-5 pt-0 border-t border-white/5 animate-slide-up space-y-4">
                    {f.description && (
                      <div className="mt-4">
                        <div className="label-eyebrow mb-1.5">vulnerability explanation</div>
                        <p className="text-xs text-slate-400 leading-relaxed font-medium">
                          {f.description}
                        </p>
                      </div>
                    )}

                    {/* AI Guided Triage */}
                    <div className="mt-4">
                      {aiResults[f.id] ? (
                        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 animate-scale-in">
                          <div className="flex items-center gap-2 mb-2">
                            <Bot size={14} className="text-accent" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-accent">
                              AI Guided Triage
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-line">
                            {aiResults[f.id]}
                          </p>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={
                            aiLoading.has(f.id) ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Bot size={12} />
                            )
                          }
                          loading={aiLoading.has(f.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAiAnalyze(f);
                          }}
                        >
                          {aiLoading.has(f.id) ? "Triaging..." : "Trigger AI Triage Advice"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
