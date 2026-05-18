"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { connectWs, fetchSession } from "@/lib/api";
import {
  CheckCircle,
  ArrowRight,
  Activity,
} from "lucide-react";
import toast from "react-hot-toast";
import PhaseStepper from "@/components/ui/PhaseStepper";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { Session, PhaseStep, PhaseStepStatus } from "@/types";

const PHASE_META = [
  { key: "0", label: "Validation", description: "Validating the target domain and loading scope rules." },
  { key: "1", label: "Passive Recon", description: "Searching public sources (certificate logs, search engines, GitHub) for subdomains." },
  { key: "2", label: "Active Recon", description: "Checking DNS resolution, open ports, and cloud assets." },
  { key: "3", label: "HTTP Probing", description: "Making HTTP requests to identify web servers, technologies, and SSL certs." },
  { key: "4", label: "Content Disc.", description: "Crawling websites and fetching historical URLs to discover hidden endpoints." },
  { key: "5", label: "Vuln Scan", description: "Running Nuclei templates against all discovered services." },
  { key: "6", label: "ROI Scoring", description: "Calculating ROI scores and consolidating findings." },
];

function buildPhaseSteps(
  currentPhase: number | null,
  completed: Set<number>,
  failed: Set<number>
): PhaseStep[] {
  return PHASE_META.map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    status: (failed.has(Number(p.key))
      ? "failed"
      : completed.has(Number(p.key))
        ? "completed"
        : currentPhase === Number(p.key)
          ? "running"
          : "pending") as PhaseStepStatus,
  }));
}

interface ScanEvent {
  event: string;
  data: Record<string, unknown>;
  time: string;
}

function EventLog({ events }: { events: ScanEvent[] }) {
  const { containerRef } = useAutoScroll({ deps: [events] });

  const getEventColor = (event: string) => {
    if (event.includes("error") || event.includes("fail")) return "text-rose-400";
    if (event.includes("complete") || event.includes("success")) return "text-emerald-400";
    if (event.includes("phase")) return "text-purple-400";
    return "text-slate-500";
  };

  return (
    <div className="bg-surface border border-white/5 rounded-xl flex flex-col">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Activity size={16} className="text-purple-500" />
          Event Log
        </h3>
        <span className="text-xs text-slate-500">{events.length} events</span>
      </div>
      <div ref={containerRef} className="overflow-y-auto bg-[var(--color-terminal)] font-mono" style={{ maxHeight: 400 }}>
        {events.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-500 text-sm">Waiting for scan events...</div>
        ) : (
          <div className="divide-y divide-white/5">
            {events.map((e, i) => (
              <div key={i} className="px-5 py-2.5 flex items-start gap-3 text-sm animate-fade-in">
                <span className="text-[10px] text-slate-600 font-mono w-14 shrink-0 pt-0.5">{e.time}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${getEventColor(e.event)}`} style={{ background: "var(--color-surface-2)" }}>
                  {e.event}
                </span>
                <span className="text-slate-500 text-xs truncate">
                  {typeof e.data === "object" ? JSON.stringify(e.data) : String(e.data)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsPanel({ session }: { session: Session | null }) {
  if (!session?.stats) return null;
  const stats = session.stats;
  return (
    <div className="grid grid-cols-4 gap-4">
      {Object.entries(stats)
        .filter(([k]) => !["sessions"].includes(k))
        .map(([key, val]) => (
          <div key={key} className="bg-surface border border-white/5 rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-slate-200">{val ?? "\u2014"}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{key.replace(/_/g, " ")}</div>
          </div>
        ))}
    </div>
  );
}

export default function ScanProgressPage() {
  const params = useParams();
  const sessionId = Number(params.sessionId);
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<number | null>(null);
  const [completedPhases, setCompletedPhases] = useState<Set<number>>(new Set());
  const [failedPhases, setFailedPhases] = useState<Set<number>>(new Set());

  useEffect(() => {
    setSessionLoading(true);
    setSessionError(null);
    fetchSession(sessionId)
      .then(setSession)
      .catch((err: Error) => setSessionError(err.message))
      .finally(() => setSessionLoading(false));

    const ws = connectWs(sessionId, (event, data) => {
      setEvents((prev) => [...prev, { event, data, time: new Date().toLocaleTimeString() }]);

      if (event === "phase_start") setCurrentPhase(data.phase as number);
      if (event === "phase_complete") {
        setCompletedPhases((prev) => new Set(prev).add(data.phase as number));
        setCurrentPhase(null);
        toast.success(`Phase ${data.phase} complete (${(data.elapsed as number)?.toFixed(1)}s)`);
      }
      if (event === "phase_error") {
        setFailedPhases((prev) => new Set(prev).add(data.phase as number));
        toast.error(`Phase ${data.phase} failed`);
      }
      if (event === "scan_complete") {
        setCompleted(true);
        setCurrentPhase(null);
        toast.success("Scan complete!");
      }
      if (event === "scan_error") {
        toast.error((data.error as string) || "Scan error");
      }
      if (event === "scan_cancelled") {
        toast("Scan cancelled");
      }
    });
    return () => ws.close();
  }, [sessionId]);

  if (sessionError) {
    return <ErrorState message={sessionError} onRetry={() => window.location.reload()} />;
  }

  const phaseSteps = buildPhaseSteps(currentPhase, completedPhases, failedPhases);
  const currentMeta = PHASE_META.find((p) => p.key === String(currentPhase));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200">Scan #{sessionId}</h1>
          {sessionLoading ? (
            <Skeleton className="h-4 w-64 mt-2" />
          ) : session ? (
            <p className="text-sm text-slate-500 mt-0.5">
              {session.workflow} scan · Started {session.started_at ? new Date(session.started_at).toLocaleString() : "\u2014"}
            </p>
          ) : null}
        </div>
        {completed && (
          <Link
            href="/workspace"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            <ArrowRight size={16} />
            Back to Dashboard
          </Link>
        )}
      </div>

      {sessionLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 skeleton rounded-lg" />
          ))}
        </div>
      ) : (
        session?.stats && <StatsPanel session={session} />
      )}

      <PhaseStepper steps={phaseSteps} currentDescription={currentMeta?.description || null} />
      <EventLog events={events} />

      {completed && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 text-center animate-slide-up">
          <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-200 mb-1">Scan Complete</h2>
          <p className="text-sm text-slate-500 mb-4">All phases have finished executing. View your results on the dashboard.</p>
          <Link
            href="/workspace"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors"
          >
            <ArrowRight size={16} />
            View Results
          </Link>
        </div>
      )}
    </div>
  );
}
