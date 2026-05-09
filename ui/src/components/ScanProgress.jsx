import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { connectWs, fetchSession } from "../api";
import {
  CheckCircle, XCircle, Clock, Loader2, Activity,
  ChevronRight, ArrowRight, BookOpen, HelpCircle,
} from "lucide-react";
import toast from "react-hot-toast";

const PHASE_NAMES = {
  0: "Scope Validation",
  1: "Passive Reconnaissance",
  2: "Active Reconnaissance",
  3: "Web Probing",
  4: "Content Discovery",
  5: "Vulnerability Scanning",
  6: "ROI Reporting",
};

const PHASE_LEARN = {
  0: "Validating the target domain and loading scope rules to ensure everything is configured correctly.",
  1: "Searching public sources (certificate logs, search engines, GitHub) to find every subdomain — without touching the target's servers.",
  2: "Checking which subdomains actually resolve in DNS, what ports are open, and if any cloud assets exist.",
  3: "Making HTTP requests to every live host to identify web servers, technologies, and SSL certificates.",
  4: "Crawling websites and fetching historical URLs to discover hidden endpoints, API routes, and JS files.",
  5: "Running Nuclei vulnerability templates against all discovered services to find CVEs and misconfigurations.",
  6: "Calculating ROI scores and consolidating all findings into a prioritized report.",
};

function PhaseTimeline({ currentPhase, completedPhases, failedPhases }) {
  const allPhases = Object.entries(PHASE_NAMES).map(([num, name]) => ({
    num: parseInt(num), name,
    status: completedPhases.has(parseInt(num)) ? "completed" :
            failedPhases.has(parseInt(num)) ? "failed" :
            currentPhase === parseInt(num) ? "running" : "pending",
  }));

  const currentLearn = currentPhase !== null ? PHASE_LEARN[currentPhase] : null;

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
        <Activity size={16} className="text-accent" />
        Scan Progress
      </h3>
      <div className="space-y-2">
        {allPhases.map((p, i) => {
          const isLast = i === allPhases.length - 1;
          return (
            <div key={p.num} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center shrink-0
                  transition-all duration-300
                  ${p.status === "completed" ? "bg-green text-white" :
                    p.status === "failed" ? "bg-red text-white" :
                    p.status === "running" ? "bg-accent text-white" :
                    "bg-surface-2 text-text-dim"}
                `}>
                  {p.status === "completed" ? <CheckCircle size={14} /> :
                   p.status === "failed" ? <XCircle size={14} /> :
                   p.status === "running" ? <Loader2 size={14} className="animate-spin" /> :
                   <span className="text-xs font-medium">{p.num}</span>}
                </div>
                {!isLast && (
                  <div className={`
                    w-0.5 h-6 mt-1 transition-colors duration-300
                    ${p.status === "completed" ? "bg-green" :
                      p.status === "running" ? "bg-accent" : "bg-border"}
                  `} />
                )}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className={`
                  text-sm font-medium transition-colors
                  ${p.status === "completed" ? "text-green" :
                    p.status === "failed" ? "text-red" :
                    p.status === "running" ? "text-accent" : "text-text-dim"}
                `}>
                  Phase {p.num}: {p.name}
                </div>
                {p.status === "running" && (
                  <>
                    <div className="mt-1.5 h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: "60%" }} />
                    </div>
                    {PHASE_LEARN[p.num] && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <BookOpen size={11} className="text-accent mt-0.5 shrink-0" />
                        <p className="text-[11px] text-text-dim/70 leading-relaxed">{PHASE_LEARN[p.num]}</p>
                      </div>
                    )}
                  </>
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

function EventLog({ events, compact }) {
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const getEventColor = (event) => {
    if (event.includes("error") || event.includes("fail")) return "text-red";
    if (event.includes("complete") || event.includes("success")) return "text-green";
    if (event.includes("phase")) return "text-accent";
    return "text-text-dim";
  };

  return (
    <div className={`bg-surface border border-border rounded-xl ${compact ? "" : ""}`}>
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          Event Log
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-dim">{events.length} events</span>
          <button onClick={() => setAutoScroll(!autoScroll)}
            className="text-xs text-text-dim hover:text-text transition-colors">
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: compact ? 300 : 400 }}>
        {events.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-text-dim text-sm">
            Waiting for scan events...
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((e, i) => (
              <div key={i} className="px-5 py-2.5 flex items-start gap-3 text-sm animate-fade-in">
                <span className="text-[10px] text-text-dim/50 font-mono w-14 shrink-0 pt-0.5">
                  {e.time}
                </span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${getEventColor(e.event)}`}
                  style={{ background: "var(--color-surface-2)" }}>
                  {e.event}
                </span>
                <span className="text-text-dim text-xs truncate">
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

function StatsPanel({ session }) {
  if (!session?.stats) return null;
  const stats = session.stats;
  return (
    <div className="grid grid-cols-4 gap-3">
      {Object.entries(stats).filter(([k]) => !["sessions"].includes(k)).map(([key, val]) => (
        <div key={key} className="bg-surface border border-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-text">{val ?? "—"}</div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider mt-0.5">
            {key.replace(/_/g, " ")}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ScanProgress() {
  const { sessionId } = useParams();
  const [events, setEvents] = useState([]);
  const [session, setSession] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [completedPhases, setCompletedPhases] = useState(new Set());
  const [failedPhases, setFailedPhases] = useState(new Set());

  useEffect(() => {
    fetchSession(Number(sessionId))
      .then(setSession)
      .catch(() => toast.error("Failed to load session"));

    const ws = connectWs(Number(sessionId), (event, data) => {
      setEvents((prev) => [...prev, { event, data, time: new Date().toLocaleTimeString() }]);

      if (event === "phase_start") setCurrentPhase(data.phase);
      if (event === "phase_complete") {
        setCompletedPhases((prev) => new Set(prev).add(data.phase));
        setCurrentPhase(null);
        toast.success(`Phase ${data.phase} complete (${data.elapsed?.toFixed(1)}s)`);
      }
      if (event === "phase_error") {
        setFailedPhases((prev) => new Set(prev).add(data.phase));
        toast.error(`Phase ${data.phase} failed`);
      }
      if (event === "scan_complete") {
        setCompleted(true);
        setCurrentPhase(null);
        toast.success("Scan complete!");
      }
      if (event === "scan_error") {
        toast.error(data.error || "Scan error");
      }
      if (event === "scan_cancelled") {
        toast("Scan cancelled", { icon: "⚠️" });
      }
    });
    return () => ws.close();
  }, [sessionId]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Scan #{sessionId}</h1>
          {session && (
            <p className="text-sm text-text-dim mt-0.5">
              {session.workflow} scan · Started {session.started_at ? new Date(session.started_at).toLocaleString() : "—"}
            </p>
          )}
        </div>
        {completed && (
          <Link to="/" className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-border text-text rounded-lg text-sm font-medium transition-colors">
            <ArrowRight size={16} />
            Back to Dashboard
          </Link>
        )}
      </div>

      {session?.stats && <StatsPanel session={session} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PhaseTimeline
          currentPhase={currentPhase}
          completedPhases={completedPhases}
          failedPhases={failedPhases}
        />
        <EventLog events={events} compact />
      </div>

      {completed && (
        <div className="bg-green/5 border border-green/20 rounded-xl p-6 text-center animate-slide-up">
          <CheckCircle size={40} className="text-green mx-auto mb-3" />
          <h2 className="text-lg font-bold text-text mb-1">Scan Complete</h2>
          <p className="text-sm text-text-dim mb-4">
            All phases have finished executing. View your results on the dashboard.
          </p>
          <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-green text-white rounded-lg text-sm font-medium hover:bg-green/90 transition-colors">
            <ArrowRight size={16} />
            View Results
          </Link>
        </div>
      )}
    </div>
  );
}
