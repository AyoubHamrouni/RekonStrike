"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Square,
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
import GuidanceLog from "@/components/ui/GuidanceLog";
import PhaseStepper from "@/components/ui/PhaseStepper";
import CompletionBanner from "@/components/ui/CompletionBanner";
import { ErrorState } from "@/components/ui/ErrorState";
import { fetchTargets, startAgentSession, sendAgentFeedback, connectAgentSSE } from "@/lib/api";
import type {
  Target,
  AgentGuidance,
  AgentStrategy,
  AgentCounters,
  AgentStatus,
  PhaseStep,
  PhaseStepStatus,
} from "@/types";

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

function StrategyCard({ strategy }: { strategy: AgentStrategy | null }) {
  if (!strategy || Object.keys(strategy).length === 0) return null;

  const focusAreas = strategy.focus_areas || [];
  const priorityTargets = strategy.priority_targets || [];
  const depth = strategy.depth_vs_breadth || "\u2014";

  return (
    <div className="bg-surface border border-white/5 rounded-xl p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4">
        <Brain size={16} className="text-purple-500" />
        Strategy
      </h3>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Approach</div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize border ${
              depth === "depth"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : depth === "breadth"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  : "bg-slate-800 text-slate-400 border-white/5"
            }`}
          >
            {depth}
          </span>
        </div>
        {focusAreas.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Focus Areas</div>
            <div className="flex flex-wrap gap-1.5">
              {focusAreas.map((a, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-purple-600/10 text-purple-400 border border-purple-600/20">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
        {priorityTargets.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Priority Targets</div>
            <div className="flex flex-wrap gap-1.5">
              {priorityTargets.map((t, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        {strategy.reasoning && (
          <div className="pt-3 border-t border-white/5">
            <p className="text-xs text-slate-500 italic">{strategy.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveCounters({ counters }: { counters: AgentCounters }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-surface border border-white/5 rounded-lg p-3 text-center transition-all duration-200 hover:border-white/10">
        <Globe size={16} className="mx-auto mb-1.5 text-purple-500" />
        <div className="text-lg font-bold text-slate-200">{counters.subdomainCount ?? 0}</div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">Subdomains</div>
      </div>
      <div className="bg-surface border border-white/5 rounded-lg p-3 text-center transition-all duration-200 hover:border-white/10">
        <TargetIcon size={16} className="mx-auto mb-1.5 text-emerald-500" />
        <div className="text-lg font-bold text-slate-200">{counters.liveHostCount ?? 0}</div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">Live Hosts</div>
      </div>
      <div className="bg-surface border border-white/5 rounded-lg p-3 text-center transition-all duration-200 hover:border-white/10">
        <Shield size={16} className="mx-auto mb-1.5 text-rose-500" />
        <div className="text-lg font-bold text-slate-200">{counters.findingCount ?? 0}</div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">Findings</div>
      </div>
    </div>
  );
}

function InterruptPanel({
  reason,
  onSendFeedback,
}: {
  reason: string;
  onSendFeedback: (action: "continue" | "stop", message: string) => void;
}) {
  const [message, setMessage] = useState("");

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Agent Needs Input</h3>
          <p className="text-xs text-slate-500 mb-4">{reason || "The agent encountered something requiring your input."}</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional guidance for the agent..."
            className="w-full px-3 py-2 bg-slate-800 border border-white/5 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-purple-600/40 transition-colors"
            rows={2}
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => onSendFeedback("continue", message)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              <Play size={14} />
              Continue
            </button>
            <button
              onClick={() => onSendFeedback("stop", message)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors cursor-pointer"
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

export default function AgentDashboard() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState("");
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
              const d = data as { subdomains?: unknown[]; live_hosts?: unknown[] };
              if (d.subdomains) setCounters((c) => ({ ...c, subdomainCount: d.subdomains!.length }));
              if (d.live_hosts) setCounters((c) => ({ ...c, liveHostCount: d.live_hosts!.length }));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200">Agent Reconnaissance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Autonomous bug bounty recon with strategist/triager AI</p>
        </div>
        {sessionId && !isComplete && (
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Running
          </span>
        )}
      </div>

      {status === "idle" && (
        <div className="bg-surface border border-white/5 rounded-xl p-5 animate-fade-in">
          {targetsError ? (
            <ErrorState title="Failed to load targets" message={targetsError} onRetry={() => window.location.reload()} />
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Target</label>
                <select
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-white/5 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-600/40 transition-colors appearance-none cursor-pointer"
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
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Goal</label>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-white/5 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-600/40 transition-colors"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleStart}
                  disabled={running || !selectedTargetId}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  <Play size={16} />
                  Start Agent
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {currentPhase && status === "running" && (
        <div className="flex items-center gap-2 animate-fade-in">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-600/10 text-purple-400 border border-purple-600/20">
            <Loader2 size={11} className="animate-spin" />
            {currentPhaseMeta?.label || currentPhase}
          </span>
          <span className="text-xs text-slate-500">Current phase</span>
        </div>
      )}

      {status !== "idle" && (
        <>
          <LiveCounters counters={counters} />
          {strategy && <StrategyCard strategy={strategy} />}

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-8">
              <GuidanceLog items={guidance} />
            </div>
            <div className="col-span-4 space-y-4">
              <PhaseStepper steps={phaseSteps} currentDescription={currentPhaseMeta?.description || null} />

              {currentPhase && (
                <div className="bg-surface border border-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
                    <BookOpen size={13} className="text-purple-500" />
                    Progress
                  </h3>
                  <div className="text-xs text-slate-500">
                    <span className="text-emerald-400 font-medium">{completedPhases.size}</span> completed,{" "}
                    <span className="text-rose-400 font-medium">{failedPhases.size}</span> failed,{" "}
                    <span className="text-slate-200 font-medium">
                      {PHASE_META.length - completedPhases.size - failedPhases.size}
                    </span>{" "}
                    remaining
                  </div>
                </div>
              )}

              {strategy?.reasoning && (
                <div className="bg-surface border border-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
                    <Brain size={13} className="text-purple-500" />
                    Strategy Note
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{strategy.reasoning}</p>
                </div>
              )}

              {sessionId && (
                <div className="bg-surface border border-white/5 rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Session ID</div>
                  <div className="text-xs text-slate-200 font-mono truncate">{sessionId}</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {interruptReason && <InterruptPanel reason={interruptReason} onSendFeedback={handleSendFeedback} />}

      {isComplete && <CompletionBanner status={status} guidance={guidance.map((g) => g.text)} onReset={handleReset} />}

      {error && !isComplete && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <XCircle size={16} className="text-rose-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-0.5">Error</h3>
            <p className="text-xs text-slate-500">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
