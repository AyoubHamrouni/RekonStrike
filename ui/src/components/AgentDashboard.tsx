import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Play,
  Square,
  ArrowRight,
  Target as TargetIcon,
  Globe,
  Shield,
  Loader2,
  AlertTriangle,
  XCircle,
  Brain,
  BookOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import GuidanceLog from "./ui/GuidanceLog";
import PhaseStepper from "./ui/PhaseStepper";
import CompletionBanner from "./ui/CompletionBanner";
import ErrorState from "./ui/ErrorState";
import { fetchTargets, startAgentSession, sendAgentFeedback, connectAgentSSE } from "../api";
import type {
  Target,
  AgentGuidance,
  AgentStrategy,
  AgentCounters,
  AgentStatus,
  PhaseStep,
  PhaseStepStatus,
} from "../types";

const PHASE_META: { key: string; label: string; description: string }[] = [
  { key: "phase_0_validate", label: "Validate", description: "Validating target and loading scope rules." },
  { key: "phase_1_passive", label: "Passive Recon", description: "Searching public sources for subdomains without touching target servers." },
  { key: "phase_3_httpprobe", label: "HTTP Probe", description: "Probing live hosts to identify web servers, technologies, and SSL certs." },
  { key: "phase_4_content", label: "Content Disc.", description: "Crawling websites to discover hidden endpoints, API routes, and JS files." },
  { key: "phase_5_vulnscan", label: "Vuln Scan", description: "Running Nuclei templates against all services to find CVEs and misconfigurations." },
  { key: "phase_6_scoring", label: "ROI Scoring", description: "Calculating ROI scores and prioritizing findings by impact." },
];

function buildPhaseSteps(
  currentPhase: string | null,
  completed: Set<string>,
  failed: Set<string>
): PhaseStep[] {
  return PHASE_META.map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    status: (failed.has(p.key)
      ? "failed"
      : completed.has(p.key)
        ? "completed"
        : currentPhase === p.key
          ? "running"
          : "pending") as PhaseStepStatus,
  }));
}

// ── StrategyCard ─────────────────────────────────────────────────────────

function StrategyCard({ strategy }: { strategy: AgentStrategy | null }) {
  if (!strategy || Object.keys(strategy).length === 0) return null;

  const focusAreas = strategy.focus_areas || [];
  const priorityTargets = strategy.priority_targets || [];
  const depth = strategy.depth_vs_breadth || "—";

  return (
    <div className="bg-surface border border-white/5 rounded-xl p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-text flex items-center gap-2 mb-4">
        <Brain size={16} className="text-accent" />
        Strategy
      </h3>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">
            Approach
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
              depth === "depth"
                ? "bg-yellow/10 text-yellow border border-yellow/20"
                : depth === "breadth"
                  ? "bg-blue/10 text-blue border border-blue/20"
                  : "bg-surface-2 text-text-dim border border-white/5"
            }`}
          >
            {depth}
          </span>
        </div>
        {focusAreas.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">
              Focus Areas
            </div>
            <div className="flex flex-wrap gap-1.5">
              {focusAreas.map((a, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded-full bg-accent-subtle text-accent border border-accent/20"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
        {priorityTargets.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">
              Priority Targets
            </div>
            <div className="flex flex-wrap gap-1.5">
              {priorityTargets.map((t, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded-full bg-green-subtle text-green border border-green/20"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        {strategy.reasoning && (
          <div className="pt-3 border-t border-white/5">
            <p className="text-xs text-text-dim italic">{strategy.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── LiveCounters ─────────────────────────────────────────────────────────

function LiveCounters({ state }: { state: AgentCounters }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-surface border border-white/5 rounded-lg p-3 text-center transition-all duration-200 hover:border-white/10">
        <Globe size={16} className="mx-auto mb-1.5 text-accent" />
        <div className="text-lg font-bold text-text">
          {state.subdomainCount ?? 0}
        </div>
        <div className="text-[10px] text-text-dim uppercase tracking-wider">
          Subdomains
        </div>
      </div>
      <div className="bg-surface border border-white/5 rounded-lg p-3 text-center transition-all duration-200 hover:border-white/10">
        <TargetIcon size={16} className="mx-auto mb-1.5 text-green" />
        <div className="text-lg font-bold text-text">
          {state.liveHostCount ?? 0}
        </div>
        <div className="text-[10px] text-text-dim uppercase tracking-wider">
          Live Hosts
        </div>
      </div>
      <div className="bg-surface border border-white/5 rounded-lg p-3 text-center transition-all duration-200 hover:border-white/10">
        <Shield size={16} className="mx-auto mb-1.5 text-red" />
        <div className="text-lg font-bold text-text">
          {state.findingCount ?? 0}
        </div>
        <div className="text-[10px] text-text-dim uppercase tracking-wider">
          Findings
        </div>
      </div>
    </div>
  );
}

// ── InterruptPanel ───────────────────────────────────────────────────────

function InterruptPanel({
  reason,
  onSendFeedback,
}: {
  reason: string;
  onSendFeedback: (action: "continue" | "stop", message: string) => void;
}) {
  const [message, setMessage] = useState("");

  return (
    <div className="bg-yellow-subtle/30 border border-yellow/20 rounded-xl p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-yellow mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text mb-1">
            Agent Needs Input
          </h3>
          <p className="text-xs text-text-dim mb-4">
            {reason ||
              "The agent encountered something requiring your input."}
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional guidance for the agent..."
            className="w-full px-3 py-2 bg-surface-2 border border-white/5 rounded-lg text-sm text-text placeholder:text-text-dim/40 resize-none focus:outline-none focus:border-accent transition-colors"
            rows={2}
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onSendFeedback("continue", message)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Play size={14} />
              Continue
            </button>
            <button
              onClick={() => onSendFeedback("stop", message)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-border text-text rounded-lg text-sm font-medium transition-colors"
            >
              <Square size={14} />
              Stop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AgentDashboard ───────────────────────────────────────────────────────

export default function AgentDashboard() {
  const { targetId } = useParams();
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState(targetId || "");
  const [goal, setGoal] = useState("find all vulnerabilities");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [guidance, setGuidance] = useState<AgentGuidance[]>([]);
  const [strategy, setStrategy] = useState<AgentStrategy | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [completedPhases, setCompletedPhases] = useState<Set<string>>(new Set());
  const [failedPhases, setFailedPhases] = useState<Set<string>>(new Set());
  const [counters, setCounters] = useState<AgentCounters>({
    subdomainCount: 0,
    liveHostCount: 0,
    findingCount: 0,
  });
  const [interruptReason, setInterruptReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setTargetsLoading(true);
    setTargetsError(null);
    fetchTargets()
      .then(setTargets)
      .catch((err: Error) => setTargetsError(err.message))
      .finally(() => setTargetsLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedTargetId) {
      toast.error("Select a target first");
      return;
    }

    setRunning(true);
    setStatus("running");
    setGuidance([]);
    setStrategy(null);
    setCurrentPhase(null);
    setCompletedPhases(new Set());
    setFailedPhases(new Set());
    setCounters({ subdomainCount: 0, liveHostCount: 0, findingCount: 0 });
    setInterruptReason("");
    setError(null);

    try {
      const session = await startAgentSession(Number(selectedTargetId), {
        goal,
        max_steps: 10,
      });
      setSessionId(session.session_id);
      toast.success("Agent session started");

      const source = connectAgentSSE(
        Number(selectedTargetId),
        session.session_id,
        (event, data) => {
          switch (event) {
            case "guidance":
              setGuidance((prev) => [
                ...prev,
                {
                  text: (data as { text: string }).text,
                  node: (data as { node: "strategy" | "triager" }).node,
                  time: new Date().toLocaleTimeString(),
                },
              ]);
              break;
            case "strategy":
              setStrategy(data as AgentStrategy);
              break;
            case "phase":
              setCurrentPhase((data as { name: string }).name);
              break;
            case "state": {
              const d = data as {
                subdomains?: unknown[];
                live_hosts?: unknown[];
              };
              if (d.subdomains)
                setCounters((c) => ({ ...c, subdomainCount: d.subdomains!.length }));
              if (d.live_hosts)
                setCounters((c) => ({ ...c, liveHostCount: d.live_hosts!.length }));
              break;
            }
            case "interrupt":
              setInterruptReason((data as { reason: string }).reason);
              setStatus("interrupted");
              break;
            case "complete": {
              const d = data as { status: string; error?: string };
              setStatus(d.status as AgentStatus);
              setRunning(false);
              setCurrentPhase(null);
              if (d.status === "completed") toast.success("Agent complete!");
              else if (d.status === "error") setError(d.error || "Unknown error");
              break;
            }
          }
        },
        () => {
          setRunning(false);
          toast.error("SSE connection lost");
        }
      );
      eventSourceRef.current = source;
    } catch (err) {
      setRunning(false);
      setStatus("error");
      setError((err as Error).message);
      toast.error(`Failed to start: ${(err as Error).message}`);
    }
  }, [selectedTargetId, goal]);

  const handleSendFeedback = useCallback(
    async (action: "continue" | "stop", message: string) => {
      if (!sessionId || !selectedTargetId) return;
      try {
        await sendAgentFeedback(Number(selectedTargetId), sessionId, {
          action,
          message,
        });
        setInterruptReason("");
        if (action === "continue") {
          setStatus("running");
          toast("Feedback sent, resuming...");
        } else {
          setStatus("interrupted");
          setRunning(false);
          toast("Agent stopped");
        }
      } catch {
        toast.error("Failed to send feedback");
      }
    },
    [sessionId, selectedTargetId]
  );

  const handleReset = useCallback(() => {
    eventSourceRef.current?.close();
    setSessionId(null);
    setRunning(false);
    setStatus("idle");
    setGuidance([]);
    setStrategy(null);
    setCurrentPhase(null);
    setCompletedPhases(new Set());
    setFailedPhases(new Set());
    setCounters({ subdomainCount: 0, liveHostCount: 0, findingCount: 0 });
    setInterruptReason("");
    setError(null);
  }, []);

  const isComplete = ["completed", "interrupted", "error"].includes(status);
  const phaseSteps = buildPhaseSteps(currentPhase, completedPhases, failedPhases);
  const currentPhaseMeta = PHASE_META.find((p) => p.key === currentPhase);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">
            Agent Reconnaissance
          </h1>
          <p className="text-sm text-text-dim mt-0.5">
            Autonomous bug bounty recon with strategist/triager AI
          </p>
        </div>
        {sessionId && !isComplete && (
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-green/10 border border-green/20 rounded-lg text-xs font-medium text-green">
            <span className="w-2 h-2 rounded-full bg-green animate-pulse-dot" />
            Running
          </span>
        )}
      </div>

      {/* Target selector / config */}
      {status === "idle" && (
        <div className="bg-surface border border-white/5 rounded-xl p-5 animate-fade-in">
          {targetsError ? (
            <ErrorState
              title="Failed to load targets"
              message={targetsError}
              onRetry={() => window.location.reload()}
            />
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-text-dim mb-1.5 block">
                  Target
                </label>
                <select
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-white/5 rounded-lg text-sm text-text focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
                >
                  <option value="">Select a target...</option>
                  {targetsLoading ? (
                    <option disabled>Loading...</option>
                  ) : (
                    targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.target}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-text-dim mb-1.5 block">
                  Goal
                </label>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-white/5 rounded-lg text-sm text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleStart}
                  disabled={running || !selectedTargetId}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Play size={16} />
                  Start Agent
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active phase badge */}
      {currentPhase && status === "running" && (
        <div className="flex items-center gap-2 animate-fade-in">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-accent-subtle text-accent border border-accent/20">
            <Loader2 size={11} className="animate-spin" />
            {currentPhaseMeta?.label || currentPhase}
          </span>
          <span className="text-xs text-text-dim">Current phase</span>
        </div>
      )}

      {status !== "idle" && (
        <>
          {/* Live counters */}
          <LiveCounters state={counters} />

          {/* Strategy card */}
          {strategy && <StrategyCard strategy={strategy} />}

          {/* Main 2-column layout */}
          <div className="grid grid-cols-12 gap-6">
            {/* Left: Guidance Log */}
            <div className="col-span-8">
              <GuidanceLog items={guidance} />
            </div>

            {/* Right: Phase Stepper + session info */}
            <div className="col-span-4 space-y-4">
              <PhaseStepper
                steps={phaseSteps}
                currentDescription={currentPhaseMeta?.description || null}
              />

              {/* Phase progress */}
              {currentPhase && (
                <div className="bg-surface border border-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
                    <BookOpen size={13} className="text-accent" />
                    Progress
                  </h3>
                  <div className="text-xs text-text-dim">
                    <span className="text-green font-medium">
                      {completedPhases.size}
                    </span>{" "}
                    completed,{" "}
                    <span className="text-red font-medium">
                      {failedPhases.size}
                    </span>{" "}
                    failed,{" "}
                    <span className="text-text font-medium">
                      {PHASE_META.length - completedPhases.size - failedPhases.size}
                    </span>{" "}
                    remaining
                  </div>
                </div>
              )}

              {/* Strategy reasoning */}
              {strategy?.reasoning && (
                <div className="bg-surface border border-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
                    <Brain size={13} className="text-accent" />
                    Strategy Note
                  </h3>
                  <p className="text-xs text-text-dim leading-relaxed">
                    {strategy.reasoning}
                  </p>
                </div>
              )}

              {/* Session info */}
              {sessionId && (
                <div className="bg-surface border border-white/5 rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">
                    Session ID
                  </div>
                  <div className="text-xs text-text font-mono truncate">
                    {sessionId}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Interrupt panel */}
      {interruptReason && (
        <InterruptPanel
          reason={interruptReason}
          onSendFeedback={handleSendFeedback}
        />
      )}

      {/* Completion banner */}
      {isComplete && (
        <CompletionBanner
          status={status}
          guidance={guidance.map((g) => g.text)}
          onReset={handleReset}
        />
      )}

      {/* Error display */}
      {error && !isComplete && (
        <div className="bg-red-subtle/30 border border-red/20 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <XCircle size={16} className="text-red mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-text mb-0.5">Error</h3>
            <p className="text-xs text-text-dim">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
