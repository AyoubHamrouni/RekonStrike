import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Play, Square, ArrowRight, MessageSquare, Target,
  Globe, Shield, Activity, Loader2, CheckCircle,
  XCircle, AlertTriangle, BookOpen, HelpCircle,
  ChevronRight, Sparkles, Brain,
} from "lucide-react";
import { fetchTargets, startAgentSession, sendAgentFeedback, connectAgentSSE } from "../api";
import toast from "react-hot-toast";
import ErrorState from "./ui/ErrorState";

const PHASE_LABELS = {
  phase_0_validate: "Scope Validation",
  phase_1_passive: "Passive Reconnaissance",
  phase_3_httpprobe: "HTTP Probing",
  phase_4_content: "Content Discovery",
  phase_5_vulnscan: "Vulnerability Scanning",
  phase_6_scoring: "ROI Scoring",
};

const PHASE_DESCRIPTIONS = {
  phase_0_validate: "Validating target and loading scope rules.",
  phase_1_passive: "Searching public sources for subdomains without touching target servers.",
  phase_3_httpprobe: "Probing live hosts to identify web servers, technologies, and SSL certs.",
  phase_4_content: "Crawling websites to discover hidden endpoints, API routes, and JS files.",
  phase_5_vulnscan: "Running Nuclei templates against all services to find CVEs and misconfigurations.",
  phase_6_scoring: "Calculating ROI scores and prioritizing findings by impact.",
};


function PhaseBadge({ phase }) {
  const label = PHASE_LABELS[phase] || phase.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-accent-subtle text-accent border border-accent/20">
      <Activity size={11} />
      {label}
    </span>
  );
}


function GuidanceLog({ items, autoScroll, setAutoScroll }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items, autoScroll]);

  return (
    <div className="bg-surface border border-border rounded-xl flex flex-col">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <MessageSquare size={16} className="text-accent" />
          Guidance Log
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-dim">{items.length} messages</span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="text-xs text-text-dim hover:text-text transition-colors"
          >
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 480 }}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-dim">
            <MessageSquare size={24} className="mb-2 opacity-40" />
            <p className="text-sm">Waiting for agent guidance...</p>
          </div>
        ) : (
          items.map((item, i) => (
            <div key={i} className="flex items-start gap-3 animate-fade-in">
              <div className={`shrink-0 mt-0.5 ${item.node === "strategy" ? "text-accent" : "text-blue"}`}>
                {item.node === "strategy" ? <Brain size={16} /> : <Sparkles size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-text-dim/60">
                    {item.node === "strategy" ? "Strategist" : "Triager"}
                  </span>
                  <span className="text-[10px] text-text-dim/40">{item.time}</span>
                </div>
                <p className="text-sm text-text leading-relaxed">{item.text}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


function StrategyCard({ strategy }) {
  if (!strategy || Object.keys(strategy).length === 0) return null;

  const focusAreas = strategy.focus_areas || [];
  const priorityTargets = strategy.priority_targets || [];
  const depth = strategy.depth_vs_breadth || "—";

  return (
    <div className="bg-surface border border-border rounded-xl p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-text flex items-center gap-2 mb-4">
        <Brain size={16} className="text-accent" />
        Strategy
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">Approach</div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
              depth === "depth" ? "bg-yellow/10 text-yellow border border-yellow/20" :
              depth === "breadth" ? "bg-blue/10 text-blue border border-blue/20" :
              "bg-surface-2 text-text-dim border border-border"
            }`}>
              {depth}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">Focus Areas</div>
          <div className="flex flex-wrap gap-1.5">
            {focusAreas.length > 0 ? focusAreas.map((a, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-accent-subtle text-accent border border-accent/20">
                {a}
              </span>
            )) : <span className="text-xs text-text-dim/60">—</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">Priority Targets</div>
          <div className="flex flex-wrap gap-1.5">
            {priorityTargets.length > 0 ? priorityTargets.map((t, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-green-subtle text-green border border-green/20">
                {t}
              </span>
            )) : <span className="text-xs text-text-dim/60">—</span>}
          </div>
        </div>
      </div>
      {strategy.reasoning && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-text-dim italic">{strategy.reasoning}</p>
        </div>
      )}
    </div>
  );
}


function PhaseTimeline({ phases, currentPhase }) {
  const allPhases = Object.entries(PHASE_LABELS).map(([key, label]) => ({
    key,
    label,
    status: phases.completed.has(key) ? "completed" :
            phases.failed.has(key) ? "failed" :
            currentPhase === key ? "running" : "pending",
  }));

  const currentLearn = PHASE_DESCRIPTIONS[currentPhase] || null;

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
        <Activity size={16} className="text-accent" />
        Phase Pipeline
      </h3>
      <div className="space-y-2">
        {allPhases.map((p, i) => {
          const isLast = i === allPhases.length - 1;
          return (
            <div key={p.key} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                  p.status === "completed" ? "bg-green text-white" :
                  p.status === "failed" ? "bg-red text-white" :
                  p.status === "running" ? "bg-accent text-white" :
                  "bg-surface-2 text-text-dim"
                }`}>
                  {p.status === "completed" ? <CheckCircle size={14} /> :
                   p.status === "failed" ? <XCircle size={14} /> :
                   p.status === "running" ? <Loader2 size={14} className="animate-spin" /> :
                   <span className="text-xs font-medium">{Object.keys(PHASE_LABELS).indexOf(p.key)}</span>}
                </div>
                {!isLast && (
                  <div className={`w-0.5 h-6 mt-1 transition-colors duration-300 ${
                    p.status === "completed" ? "bg-green" :
                    p.status === "running" ? "bg-accent" : "bg-border"
                  }`} />
                )}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className={`text-sm font-medium transition-colors ${
                  p.status === "completed" ? "text-green" :
                  p.status === "failed" ? "text-red" :
                  p.status === "running" ? "text-accent" : "text-text-dim"
                }`}>
                  {p.label}
                </div>
                {p.status === "running" && (
                  <div className="mt-1.5 h-1 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: "60%" }} />
                  </div>
                )}
                {p.status === "completed" && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <CheckCircle size={10} className="text-green" />
                    <span className="text-[10px] text-green/70">Complete</span>
                  </div>
                )}
                {p.status === "failed" && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <XCircle size={10} className="text-red" />
                    <span className="text-[10px] text-red/70">Failed</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentLearn && (
        <div className="mt-4 p-3 rounded-lg bg-accent-subtle/30 border border-accent/20 flex items-start gap-2 animate-fade-in">
          <HelpCircle size={13} className="text-accent mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-text mb-0.5">What's happening now?</p>
            <p className="text-[11px] text-text-dim/70 leading-relaxed">{currentLearn}</p>
          </div>
        </div>
      )}
    </div>
  );
}


function LiveCounters({ state }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-surface border border-border rounded-lg p-3 text-center card-hover">
        <Globe size={16} className="mx-auto mb-1.5 text-accent" />
        <div className="text-lg font-bold text-text">{state.subdomainCount ?? 0}</div>
        <div className="text-[10px] text-text-dim uppercase tracking-wider">Subdomains</div>
      </div>
      <div className="bg-surface border border-border rounded-lg p-3 text-center card-hover">
        <Target size={16} className="mx-auto mb-1.5 text-green" />
        <div className="text-lg font-bold text-text">{state.liveHostCount ?? 0}</div>
        <div className="text-[10px] text-text-dim uppercase tracking-wider">Live Hosts</div>
      </div>
      <div className="bg-surface border border-border rounded-lg p-3 text-center card-hover">
        <Shield size={16} className="mx-auto mb-1.5 text-red" />
        <div className="text-lg font-bold text-text">{state.findingCount ?? 0}</div>
        <div className="text-[10px] text-text-dim uppercase tracking-wider">Findings</div>
      </div>
    </div>
  );
}


function InterruptPanel({ reason, onSendFeedback }) {
  const [message, setMessage] = useState("");

  return (
    <div className="bg-yellow-subtle/30 border border-yellow/20 rounded-xl p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-yellow mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text mb-1">Agent Needs Input</h3>
          <p className="text-xs text-text-dim mb-4">{reason || "The agent encountered something requiring your input."}</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional guidance for the agent..."
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text placeholder:text-text-dim/40 resize-none focus:outline-none focus:border-accent transition-colors"
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


function CompletionBanner({ status, guidance, onReset }) {
  return (
    <div className={`rounded-xl p-6 text-center animate-slide-up ${
      status === "completed" ? "bg-green/5 border border-green/20" :
      status === "interrupted" ? "bg-yellow/5 border border-yellow/20" :
      "bg-red/5 border border-red/20"
    }`}>
      <div className="mb-3">
        {status === "completed" ? <CheckCircle size={40} className="text-green mx-auto" /> :
         status === "interrupted" ? <AlertTriangle size={40} className="text-yellow mx-auto" /> :
         <XCircle size={40} className="text-red mx-auto" />}
      </div>
      <h2 className="text-lg font-bold text-text mb-1">
        {status === "completed" ? "Reconnaissance Complete" :
         status === "interrupted" ? "Session Interrupted" :
         "Session Error"}
      </h2>
      {guidance.length > 0 && (
        <p className="text-sm text-text-dim mb-4 max-w-lg mx-auto">{guidance[guidance.length - 1]}</p>
      )}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Play size={16} />
          New Session
        </button>
        <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-2 hover:bg-border text-text rounded-lg text-sm font-medium transition-colors">
          <ArrowRight size={16} />
          Dashboard
        </Link>
      </div>
    </div>
  );
}


export default function AgentDashboard() {
  const { targetId } = useParams();
  const [targets, setTargets] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState(null);
  const [selectedTargetId, setSelectedTargetId] = useState(targetId || "");
  const [goal, setGoal] = useState("find all vulnerabilities");
  const [sessionId, setSessionId] = useState(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | running | completed | interrupted | error
  const [guidance, setGuidance] = useState([]);
  const [strategy, setStrategy] = useState(null);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [phases, setPhases] = useState({ completed: new Set(), failed: new Set() });
  const [counters, setCounters] = useState({ subdomainCount: 0, liveHostCount: 0, findingCount: 0 });
  const [interruptReason, setInterruptReason] = useState("");
  const [error, setError] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const eventSourceRef = useRef(null);

  // Fetch targets for the selector
  useEffect(() => {
    setTargetsLoading(true);
    setTargetsError(null);
    fetchTargets()
      .then(setTargets)
      .catch((err) => setTargetsError(err.message))
      .finally(() => setTargetsLoading(false));
  }, []);

  // Cleanup on unmount
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
    setPhases({ completed: new Set(), failed: new Set() });
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

      // Connect SSE
      const source = connectAgentSSE(
        Number(selectedTargetId),
        session.session_id,
        (event, data) => {
          switch (event) {
            case "guidance":
              setGuidance((prev) => [
                ...prev,
                { text: data.text, node: data.node, time: new Date().toLocaleTimeString() },
              ]);
              break;
            case "strategy":
              setStrategy(data);
              break;
            case "phase":
              setCurrentPhase(data.name);
              break;
            case "state":
              if (data.subdomains) setCounters((c) => ({ ...c, subdomainCount: data.subdomains.length }));
              if (data.live_hosts) setCounters((c) => ({ ...c, liveHostCount: data.live_hosts.length }));
              // Transition phase tracking from node names
              if (data.node === "executor" && data.next_action) {
                setCurrentPhase(data.next_action);
              }
              break;
            case "interrupt":
              setInterruptReason(data.reason);
              setStatus("interrupted");
              break;
            case "complete":
              setStatus(data.status);
              setRunning(false);
              setCurrentPhase(null);
              if (data.status === "completed") toast.success("Agent complete!");
              else if (data.status === "error") setError(data.error || "Unknown error");
              break;
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
      setError(err.message);
      toast.error(`Failed to start: ${err.message}`);
    }
  }, [selectedTargetId, goal]);

  const handleSendFeedback = useCallback(async (action, message) => {
    if (!sessionId || !selectedTargetId) return;
    try {
      await sendAgentFeedback(Number(selectedTargetId), sessionId, { action, message });
      setInterruptReason("");
      if (action === "continue") {
        setStatus("running");
        toast("Feedback sent, resuming...");
      } else {
        setStatus("interrupted");
        setRunning(false);
        toast("Agent stopped");
      }
    } catch (err) {
      toast.error("Failed to send feedback");
    }
  }, [sessionId, selectedTargetId]);

  const handleReset = useCallback(() => {
    eventSourceRef.current?.close();
    setSessionId(null);
    setRunning(false);
    setStatus("idle");
    setGuidance([]);
    setStrategy(null);
    setCurrentPhase(null);
    setPhases({ completed: new Set(), failed: new Set() });
    setCounters({ subdomainCount: 0, liveHostCount: 0, findingCount: 0 });
    setInterruptReason("");
    setError(null);
  }, []);

  const isComplete = ["completed", "interrupted", "error"].includes(status);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Agent Reconnaissance</h1>
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

      {/* Target selector / config (shown when idle) */}
      {status === "idle" && (
        <div className="bg-surface border border-border rounded-xl p-5 animate-fade-in">
          {targetsError ? (
            <ErrorState title="Failed to load targets" message={targetsError} onRetry={() => window.location.reload()} />
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-text-dim mb-1.5 block">Target</label>
              <select
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
              >
                <option value="">Select a target...</option>
                {targetsLoading ? (
                  <option disabled>Loading...</option>
                ) : targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.target}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-text-dim mb-1.5 block">Goal</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent transition-colors"
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

      {/* Phase badge during run */}
      {currentPhase && status === "running" && (
        <div className="flex items-center gap-2 animate-fade-in">
          <PhaseBadge phase={currentPhase} />
          <span className="text-xs text-text-dim">Current phase</span>
        </div>
      )}

      {/* Live counters */}
      {status !== "idle" && (
        <LiveCounters state={counters} />
      )}

      {/* Strategy card */}
      {strategy && <StrategyCard strategy={strategy} />}

      {/* Main grid: guidance + phase timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <GuidanceLog
            items={guidance}
            autoScroll={autoScroll}
            setAutoScroll={setAutoScroll}
          />
        </div>
        <div className="space-y-4">
          <PhaseTimeline phases={phases} currentPhase={currentPhase} />

          {/* Strategy reasoning summary */}
          {strategy?.reasoning && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
                <BookOpen size={13} className="text-accent" />
                Strategy Note
              </h3>
              <p className="text-xs text-text-dim leading-relaxed">{strategy.reasoning}</p>
            </div>
          )}

          {/* Session info */}
          {sessionId && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-text-dim mb-1">Session ID</div>
              <div className="text-xs text-text font-mono truncate">{sessionId}</div>
            </div>
          )}
        </div>
      </div>

      {/* Interrupt panel */}
      {interruptReason && (
        <InterruptPanel reason={interruptReason} onSendFeedback={handleSendFeedback} />
      )}

      {/* Completion banner */}
      {isComplete && (
        <CompletionBanner status={status} guidance={guidance.map((g) => g.text)} onReset={handleReset} />
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