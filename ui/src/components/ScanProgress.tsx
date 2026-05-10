import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { connectWs, fetchSession } from "../api";
import {
  CheckCircle,
  XCircle,
  ArrowRight,
  Activity,
} from "lucide-react";
import toast from "react-hot-toast";
import PhaseStepper from "./ui/PhaseStepper";
import ErrorState from "./ui/ErrorState";
import { SkeletonCard } from "./ui/Skeleton";
import { useAutoScroll } from "../hooks/useAutoScroll";
import type { Session, PhaseStep, PhaseStepStatus } from "../types";

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

// ── EventLog ─────────────────────────────────────────────────────────────

interface ScanEvent {
  event: string;
  data: Record<string, unknown>;
  time: string;
}

function EventLog({ events }: { events: ScanEvent[] }) {
  const { containerRef, autoScroll, setAutoScroll } = useAutoScroll({
    deps: [events],
  });

  const getEventColor = (event: string) => {
    if (event.includes("error") || event.includes("fail")) return "text-red";
    if (event.includes("complete") || event.includes("success")) return "text-green";
    if (event.includes("phase")) return "text-accent";
    return "text-text-dim";
  };

  return (
    <div className="bg-surface border border-white/5 rounded-xl flex flex-col">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          Event Log
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">{events.length} events</span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs transition-colors ${
              autoScroll
                ? "text-accent hover:text-accent-hover"
                : "text-text-dim hover:text-text"
            }`}
          >
            {autoScroll ? "Auto ON" : "Auto OFF"}
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="overflow-y-auto bg-terminal font-mono"
        style={{ maxHeight: 400 }}
      >
        {events.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-text-dim text-sm">
            Waiting for scan events...
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {events.map((e, i) => (
              <div
                key={i}
                className="px-5 py-2.5 flex items-start gap-3 text-sm animate-fade-in"
              >
                <span className="text-[10px] text-text-dim/50 font-mono w-14 shrink-0 pt-0.5">
                  {e.time}
                </span>
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${getEventColor(e.event)}`}
                  style={{ background: "var(--color-surface-2)" }}
                >
                  {e.event}
                </span>
                <span className="text-text-dim text-xs truncate">
                  {typeof e.data === "object"
                    ? JSON.stringify(e.data)
                    : String(e.data)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── StatsPanel ───────────────────────────────────────────────────────────

function StatsPanel({ session }: { session: Session | null }) {
  if (!session?.stats) return null;
  const stats = session.stats;
  return (
    <div className="grid grid-cols-4 gap-4">
      {Object.entries(stats)
        .filter(([k]) => !["sessions"].includes(k))
        .map(([key, val]) => (
          <div
            key={key}
            className="bg-surface border border-white/5 rounded-lg p-4 text-center"
          >
            <div className="text-lg font-bold text-text">{val ?? "—"}</div>
            <div className="text-[10px] text-text-dim uppercase tracking-wider mt-0.5">
              {key.replace(/_/g, " ")}
            </div>
          </div>
        ))}
    </div>
  );
}

// ── ScanProgress ─────────────────────────────────────────────────────────

export default function ScanProgress() {
  const { sessionId } = useParams();
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
    fetchSession(Number(sessionId))
      .then(setSession)
      .catch((err: Error) => setSessionError(err.message))
      .finally(() => setSessionLoading(false));

    const ws = connectWs(Number(sessionId), (event, data) => {
      setEvents((prev) => [
        ...prev,
        { event, data, time: new Date().toLocaleTimeString() },
      ]);

      if (event === "phase_start") setCurrentPhase(data.phase as number);
      if (event === "phase_complete") {
        setCompletedPhases((prev) => new Set(prev).add(data.phase as number));
        setCurrentPhase(null);
        toast.success(
          `Phase ${data.phase} complete (${(data.elapsed as number)?.toFixed(1)}s)`
        );
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
    return (
      <ErrorState
        title="Failed to load session"
        message={sessionError}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const phaseSteps = buildPhaseSteps(currentPhase, completedPhases, failedPhases);
  const currentMeta = PHASE_META.find((p) => p.key === String(currentPhase));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Scan #{sessionId}</h1>
          {sessionLoading ? (
            <div className="skeleton h-4 w-64 mt-2" />
          ) : session ? (
            <p className="text-sm text-text-dim mt-0.5">
              {session.workflow} scan · Started{" "}
              {session.started_at
                ? new Date(session.started_at).toLocaleString()
                : "—"}
            </p>
          ) : null}
        </div>
        {completed && (
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-border text-text rounded-lg text-sm font-medium transition-colors"
          >
            <ArrowRight size={16} />
            Back to Dashboard
          </Link>
        )}
      </div>

      {/* Stats row */}
      {sessionLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        session?.stats && <StatsPanel session={session} />
      )}

      {/* Phase stepper — single row, full width */}
      <PhaseStepper
        steps={phaseSteps}
        currentDescription={currentMeta?.description || null}
      />

      {/* Event log — full width below stepper */}
      <EventLog events={events} />

      {/* Completion state */}
      {completed && (
        <div className="bg-green/5 border border-green/20 rounded-xl p-6 text-center animate-slide-up">
          <CheckCircle size={40} className="text-green mx-auto mb-3" />
          <h2 className="text-lg font-bold text-text mb-1">Scan Complete</h2>
          <p className="text-sm text-text-dim mb-4">
            All phases have finished executing. View your results on the
            dashboard.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green text-white rounded-lg text-sm font-medium hover:bg-green/90 transition-colors"
          >
            <ArrowRight size={16} />
            View Results
          </Link>
        </div>
      )}
    </div>
  );
}
