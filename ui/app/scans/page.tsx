"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Radar,
  Play,
  StopCircle,
  Plus,
  X,
  Crosshair,
  Globe,
  Server,
  CheckCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchPhases, fetchSessions, startScan } from "@/lib/api";
import { relativeTime, statusColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Phase, Session } from "@/types";
import toast from "react-hot-toast";

const LEARN_PHASES: Record<number, string> = {
  0: "Validates the target and loads scope rules to ensure everything is configured correctly.",
  1: "Searches public sources (certificate logs, search engines, GitHub) to discover subdomains without touching the target's servers.",
  2: "Checks which subdomains actually resolve in DNS, what ports are open, and if any cloud assets exist.",
  3: "Makes HTTP requests to every live host to identify web servers, technologies, and SSL certificates.",
  4: "Crawls websites and fetches historical URLs to discover hidden endpoints, API routes, and JS files.",
  5: "Runs Nuclei vulnerability templates against all discovered services to find CVEs and misconfigurations.",
  6: "Calculates ROI scores and consolidates all findings into a prioritized report.",
};

interface TargetTypeConfig {
  value: string;
  label: string;
  icon: typeof Globe;
  desc: string;
}

const TARGET_TYPES: TargetTypeConfig[] = [
  { value: "domain", label: "Domain", icon: Globe, desc: "Discover subdomains, crawl endpoints, and scan for vulnerabilities." },
  { value: "ip", label: "IP Range", icon: Server, desc: "Scan IP ranges for open ports, services, and hosted web applications." },
];

export default function ScansPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [phasesLoading, setPhasesLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Modal state
  const [target, setTarget] = useState("");
  const [targetType, setTargetType] = useState("domain");
  const [selectedPhases, setSelectedPhases] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSessions(50)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));

    fetchPhases()
      .then((data) => {
        setPhases(data);
        setSelectedPhases(new Set(data.map((p) => p.id)));
      })
      .catch(() => {})
      .finally(() => setPhasesLoading(false));
  }, []);

  const validate = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!target.trim()) errs.target = "Target is required";
    if (targetType === "domain" && !/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(target.trim())) {
      errs.target = "Enter a valid domain (e.g., example.com)";
    }
    if (selectedPhases.size === 0) errs.phases = "Select at least one phase";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [target, targetType, selectedPhases]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await startScan({
        target: target.trim(),
        target_type: targetType,
        phases: Array.from(selectedPhases),
      });
      toast.success("Scan started");
      setShowModal(false);
      router.push(`/scans/${result.session_id}`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to start scan");
    } finally {
      setSubmitting(false);
    }
  }, [target, targetType, selectedPhases, validate, router]);

  const togglePhase = (phaseId: number) => {
    setSelectedPhases((prev) => {
      const next = new Set(prev);
      next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId);
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label-eyebrow">recon pipeline</div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">Scans</h1>
          <p className="text-sm text-dim mt-1">
            Sessions, phases, and live workflow telemetry. WebSocket-driven progress.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={14} />}
          onClick={() => setShowModal(true)}
        >
          New Scan
        </Button>
      </div>

      {/* Main 2/3 + 1/3 grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Sessions table */}
        <div className="lg:col-span-2">
          <div className="card-border overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold text-white">Sessions</h3>
              <span className="label-eyebrow">{sessions.length} total</span>
            </div>

            {sessionsLoading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No scan sessions"
                  description="Create a scan to start reconnaissance."
                  action={
                    <Button variant="primary" size="sm" icon={<Plus size={12} />} onClick={() => setShowModal(true)}>
                      New Scan
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="label-eyebrow px-5 py-3">ID</th>
                      <th className="label-eyebrow py-3">Workflow</th>
                      <th className="label-eyebrow py-3">Phase</th>
                      <th className="label-eyebrow py-3">Started</th>
                      <th className="label-eyebrow py-3">Status</th>
                      <th className="label-eyebrow px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-border last:border-none hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={() => router.push(`/scans/${s.id}`)}
                      >
                        <td className="mono px-5 py-3 text-dim">#{s.id}</td>
                        <td className="py-3 text-white font-medium">{s.workflow || "recon"}</td>
                        <td className="py-3 text-muted">{s.current_phase ?? "—"}</td>
                        <td className="py-3 text-muted">{relativeTime(s.started_at)}</td>
                        <td className="py-3">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", statusColor(s.status))}>
                            {s.status === "running" && <Activity size={10} className="animate-pulse" />}
                            {s.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {s.status === "running" ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); }}
                              className="inline-flex items-center gap-1.5 rounded-md border border-red/40 bg-red/10 px-2.5 py-1 text-xs text-red hover:bg-red/20 transition-colors cursor-pointer"
                            >
                              <StopCircle className="h-3 w-3" /> Cancel
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); }}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-white transition-colors cursor-pointer"
                            >
                              <Play className="h-3 w-3" /> Replay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Registered phases */}
        <div className="card-border p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="label-eyebrow">pipeline</div>
              <h3 className="mt-1 text-base font-semibold text-white">Registered phases</h3>
            </div>
            <Radar className="h-4 w-4 text-accent" />
          </div>
          {phasesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : phases.length === 0 ? (
            <div className="py-6 text-center text-xs text-dim">
              <ol className="space-y-3">
                {Object.entries(LEARN_PHASES).map(([num, desc]) => (
                  <li key={num} className="flex gap-3">
                    <div className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-semibold text-accent ring-1 ring-accent/30">
                      {num}
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="text-[11px] text-dim">{desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <ol className="space-y-3">
              {phases.map((p) => (
                <li key={p.id} className="flex gap-3">
                  <div className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-semibold text-accent ring-1 ring-accent/30">
                    {p.number ?? p.id}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{p.name}</div>
                    <div className="text-[11px] text-dim">
                      {p.description || LEARN_PHASES[p.id] || ""}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* New Scan Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <div>
                <div className="label-eyebrow">new reconnaissance</div>
                <h2 className="text-lg font-bold text-white mt-1">Configure Scan</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md p-1.5 text-dim hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Target input */}
              <div>
                <label htmlFor="scan-target" className="label-eyebrow mb-1.5 block">Target</label>
                <input
                  id="scan-target"
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={targetType === "domain" ? "example.com" : "192.168.1.0/24"}
                  className={cn(
                    "w-full px-3 py-2.5 bg-bg border rounded-lg text-sm text-white placeholder:text-dim focus:outline-none focus:border-accent/50 transition-colors mono",
                    errors.target ? "border-red" : "border-border"
                  )}
                />
                {errors.target && (
                  <p className="text-xs text-red mt-1 flex items-center gap-1">
                    <AlertTriangle size={11} /> {errors.target}
                  </p>
                )}
              </div>

              {/* Target type */}
              <div>
                <label className="label-eyebrow mb-2 block">Target Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {TARGET_TYPES.map(({ value, label, icon: Icon, desc }) => (
                    <button
                      key={value}
                      onClick={() => setTargetType(value)}
                      className={cn(
                        "text-left p-3 rounded-lg border transition-all cursor-pointer",
                        targetType === value
                          ? "bg-accent/10 border-accent/30 ring-1 ring-accent/20"
                          : "bg-surface-2/40 border-border hover:border-border-strong"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={16} className={targetType === value ? "text-accent" : "text-dim"} />
                        <span className={cn("text-sm font-medium", targetType === value ? "text-accent" : "text-white")}>{label}</span>
                        {targetType === value && <CheckCircle size={14} className="ml-auto text-accent" />}
                      </div>
                      <p className="text-[11px] text-dim leading-relaxed">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Phase selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label-eyebrow">Phases</label>
                  <button
                    onClick={() => {
                      if (selectedPhases.size === phases.length) setSelectedPhases(new Set());
                      else setSelectedPhases(new Set(phases.map((p) => p.id)));
                    }}
                    className="text-[10px] text-accent hover:text-accent/80 transition-colors cursor-pointer font-semibold uppercase tracking-wider"
                  >
                    {selectedPhases.size === phases.length ? "Clear All" : "Select All"}
                  </button>
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {phases.length > 0 ? (
                    phases.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => togglePhase(p.id)}
                        className={cn(
                          "w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-center gap-3",
                          selectedPhases.has(p.id)
                            ? "bg-accent/10 border-accent/30"
                            : "bg-surface-2/20 border-border hover:border-border-strong"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors",
                          selectedPhases.has(p.id) ? "bg-accent text-white" : "bg-surface-2 border border-border"
                        )}>
                          {selectedPhases.has(p.id) && <CheckCircle size={10} />}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-white">
                            Phase {p.number || p.id}: {p.name}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    Object.entries(LEARN_PHASES).map(([num, desc]) => (
                      <div key={num} className="p-2.5 rounded-lg bg-accent/5 border border-accent/10 flex items-center gap-3">
                        <div className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent text-[10px] font-bold text-white">
                          {num}
                        </div>
                        <span className="text-[11px] text-dim truncate">{desc.slice(0, 60)}…</span>
                      </div>
                    ))
                  )}
                </div>
                {errors.phases && (
                  <p className="text-xs text-red mt-1 flex items-center gap-1">
                    <AlertTriangle size={11} /> {errors.phases}
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 flex items-center gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm text-muted hover:text-white hover:border-border-strong transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-glow"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Starting…
                  </>
                ) : (
                  <>
                    <Crosshair size={14} /> Start Scan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
