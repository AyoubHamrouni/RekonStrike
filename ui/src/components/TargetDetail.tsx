import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Globe, Shield, Activity, BarChart3, Download,
  RefreshCw, ArrowLeft, BookOpen, BugPlay, Brain,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchTargets, fetchStats, fetchProgramScope,
} from "../api";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import SubdomainList from "./SubdomainList";
import LiveHostList from "./LiveHostList";
import VulnerabilityList from "./VulnerabilityList";
import EndpointList from "./EndpointList";
import ManualWorkspace from "./ManualWorkspace";
import FindingTracker from "./FindingTracker";
import AIPanel from "./AIPanel";
import type { Target, Stats } from "../types";
import type { ComponentType } from "react";

interface TabConfig {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  desc: string;
}

const tabs: TabConfig[] = [
  { key: "subdomains", label: "Subdomains", icon: Globe, desc: "All discovered domains under this target." },
  { key: "hosts", label: "Live Hosts", icon: Activity, desc: "Subdomains confirmed alive via HTTP probing." },
  { key: "vulns", label: "Vulnerabilities", icon: Shield, desc: "Security issues found by Nuclei templates." },
  { key: "endpoints", label: "Endpoints", icon: BarChart3, desc: "Crawled URLs, API routes, and hidden paths." },
  { key: "manual", label: "Manual Testing", icon: BugPlay, desc: "Guided manual testing modules with step-by-step instructions." },
];

const tabLearn: Record<string, string> = {
  subdomains: "Subdomains are the building blocks of recon. More subdomains = more attack surface.",
  hosts: "Live hosts are subdomains that actually respond to HTTP requests.",
  vulns: "Vulnerabilities ranked by severity. Start with Critical/High first.",
  endpoints: "Look for /api, /admin, /graphql. These are where bugs hide.",
  manual: "Use Discover → Test → Verify workflow for each module. Findings saved locally.",
};

const severityColors: Record<string, string> = {
  critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94", info: "#00d4aa",
};

// ── AttackSurfaceChart ───────────────────────────────────────────────────

function AttackSurfaceChart({ stats }: { stats: Stats | null }) {
  if (!stats) return null;
  const data = [
    { name: "Subdomains", value: stats.subdomains || 0, color: "#6c5ce7" },
    { name: "Live Hosts", value: stats.live_hosts || 0, color: "#00d4aa" },
    { name: "Vulnerabilities", value: typeof stats.vulnerabilities === "number" ? stats.vulnerabilities : 0, color: "#e05a4f" },
    { name: "Endpoints", value: Math.min(stats.endpoints || 0, 10000), color: "#4a9eff" },
  ].filter((d) => d.value > 0);

  if (!data.length) return null;

  return (
    <div className="bg-surface border border-white/5 rounded-xl p-5">
      <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-4">
        Attack Surface
      </h3>
      <div className="flex items-center gap-6">
        <div className="shrink-0">
          <ResponsiveContainer width={120} height={120}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={55}
                paddingAngle={2} dataKey="value" stroke="none">
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-text-dim">{d.name}</div>
              </div>
              <div className="text-sm font-bold text-text">{d.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── LearnCard ────────────────────────────────────────────────────────────

function LearnCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-accent-subtle/30 border border-accent/20 rounded-xl p-4 flex items-start gap-3">
      <BookOpen size={16} className="text-accent mt-0.5 shrink-0" />
      <div className="text-xs text-text-dim/80 leading-relaxed">{children}</div>
    </div>
  );
}

// ── TargetDetail ─────────────────────────────────────────────────────────

export default function TargetDetail() {
  const { id } = useParams();
  const [target, setTarget] = useState<Target | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState("subdomains");
  const [loading, setLoading] = useState(true);
  const [showLearn, setShowLearn] = useState(false);
  const [showTracker, setShowTracker] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [hasProgramScope, setHasProgramScope] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchTargets().then((ts) => ts.find((t) => t.id === Number(id))),
      fetchStats(Number(id)),
      fetchProgramScope(Number(id)).then(() => true).catch(() => false),
    ])
      .then(([t, s, hasScope]) => {
        setTarget(t ?? null);
        setStats(s);
        setHasProgramScope(hasScope);
      })
      .catch(() => toast.error("Failed to load target"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!stats || !stats.sessions) return;
    const interval = setInterval(() => {
      fetchStats(Number(id)).then(setStats).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [stats, id]);

  if (loading && !target) {
    return (
      <div>
        <div className="skeleton h-8 w-64 mb-2" />
        <div className="skeleton h-4 w-48 mb-6" />
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!target) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-red-subtle flex items-center justify-center mb-4">
          <Shield size={28} className="text-red" />
        </div>
        <h2 className="text-lg font-semibold text-text mb-2">Target not found</h2>
        <p className="text-sm text-text-dim mb-4">This target doesn't exist or may have been deleted.</p>
        <Link to="/" className="text-sm text-accent hover:underline">Back to Dashboard</Link>
      </div>
    );
  }

  const currentTab = tabs.find((t) => t.key === tab);

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-text transition-colors">
        <ArrowLeft size={14} />
        Back to Dashboard
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text">{target.target}</h1>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-surface-2 text-text-dim font-medium">
              {target.target_type}
            </span>
          </div>
          <p className="text-sm text-text-dim mt-1">
            Added {target.created_at?.slice(0, 10)}
            {stats?.sessions && stats.sessions > 0 ? ` · ${stats.sessions} scan${stats.sessions > 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAI(!showAI)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-subtle text-accent text-xs font-medium hover:bg-accent/20 transition-colors">
            <Brain size={13} />
            {showAI ? "Hide AI" : "AI Analysis"}
          </button>
          <button onClick={() => setShowLearn(!showLearn)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-subtle text-accent text-xs font-medium hover:bg-accent/20 transition-colors">
            <BookOpen size={13} />
            {showLearn ? "Hide Guide" : "Recon Guide"}
          </button>
          <button onClick={load}
            className="p-2 rounded-lg hover:bg-surface-2 text-text-dim hover:text-text transition-colors"
            title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {showTracker && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setShowTracker(false)}
              className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-text transition-colors">
              <ArrowLeft size={14} />
              Back to target
            </button>
          </div>
          <FindingTracker targetId={Number(id)} targetUrl={target?.target} onClose={() => setShowTracker(false)} />
        </div>
      )}

      {!showTracker && showLearn && (
        <LearnCard>
          <strong className="text-text">Understanding your recon results:</strong><br />
          <strong>Subdomains</strong> = every domain discovered → <strong>Live Hosts</strong> = ones that actually respond → <strong>Vulnerabilities</strong> = security issues found → <strong>Endpoints</strong> = specific URLs/resources discovered.
          {stats && !stats.live_hosts && " Run all 7 phases to get complete results across all tabs."}
        </LearnCard>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-surface border border-white/5 rounded-xl p-4 transition-all duration-200 hover:border-white/10">
              <div className="text-2xl font-bold text-text">{stats.subdomains}</div>
              <div className="text-xs text-text-dim mt-1">Subdomains</div>
              <div className="text-[10px] text-text-dim/50 mt-0.5">Total discovered</div>
            </div>
            <div className="bg-surface border border-white/5 rounded-xl p-4 transition-all duration-200 hover:border-white/10">
              <div className="text-2xl font-bold text-text">{stats.resolved_subdomains ?? "—"}</div>
              <div className="text-xs text-text-dim mt-1">Resolved</div>
              <div className="text-[10px] text-text-dim/50 mt-0.5">DNS resolution OK</div>
            </div>
            <div className="bg-surface border border-white/5 rounded-xl p-4 transition-all duration-200 hover:border-white/10">
              <div className="text-2xl font-bold text-green">{stats.live_hosts}</div>
              <div className="text-xs text-text-dim mt-1">Live Hosts</div>
              <div className="text-[10px] text-text-dim/50 mt-0.5">HTTP response received</div>
            </div>
            <div className="bg-surface border border-white/5 rounded-xl p-4 transition-all duration-200 hover:border-white/10">
              <div className="text-2xl font-bold text-red">{typeof stats.vulnerabilities === "number" ? stats.vulnerabilities : "—"}</div>
              <div className="text-xs text-text-dim mt-1">Vulnerabilities</div>
              <div className="text-[10px] text-text-dim/50 mt-0.5">Nuclei findings</div>
            </div>
            <div className="bg-surface border border-white/5 rounded-xl p-4 transition-all duration-200 hover:border-white/10">
              <div className="text-2xl font-bold text-blue">{stats.endpoints?.toLocaleString() ?? "—"}</div>
              <div className="text-xs text-text-dim mt-1">Endpoints</div>
              <div className="text-[10px] text-text-dim/50 mt-0.5">Crawled URLs</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <AttackSurfaceChart stats={stats} />
            <div className="bg-surface border border-white/5 rounded-xl p-5 col-span-2">
              <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-4">
                Actions
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <a href={`/targets/${id}/export/subdomains?format=json`}
                  className="flex items-center gap-2 p-3 rounded-lg bg-surface-2 hover:bg-border transition-colors text-xs text-text-dim hover:text-text">
                  <Download size={14} />
                  Subdomains (JSON)
                </a>
                <a href={`/targets/${id}/export/subdomains?format=csv`}
                  className="flex items-center gap-2 p-3 rounded-lg bg-surface-2 hover:bg-border transition-colors text-xs text-text-dim hover:text-text">
                  <Download size={14} />
                  Subdomains (CSV)
                </a>
                <a href={`/targets/${id}/export/live-hosts?format=json`}
                  className="flex items-center gap-2 p-3 rounded-lg bg-surface-2 hover:bg-border transition-colors text-xs text-text-dim hover:text-text">
                  <Download size={14} />
                  Live Hosts (JSON)
                </a>
                <a href={`/targets/${id}/export/vulnerabilities?format=csv`}
                  className="flex items-center gap-2 p-3 rounded-lg bg-surface-2 hover:bg-border transition-colors text-xs text-text-dim hover:text-text">
                  <Download size={14} />
                  Vulns (CSV)
                </a>
                <button onClick={() => setShowTracker(true)}
                  className="flex items-center gap-2 p-3 rounded-lg bg-surface-2 hover:bg-border transition-colors text-xs text-text-dim hover:text-text">
                  <BugPlay size={14} />
                  Finding Tracker
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showAI && (
        <AIPanel targetId={Number(id)} stats={stats ?? undefined} hasProgramScope={hasProgramScope} />
      )}

      <div className="flex gap-1 border-b border-white/5 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all duration-150 ${
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-text-dim hover:text-text hover:border-white/10"
              }`}>
              <Icon size={15} />
              {t.label}
              {stats && t.key === tab && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2">
                  {t.key === "subdomains" ? stats.subdomains :
                   t.key === "hosts" ? stats.live_hosts :
                   t.key === "vulns" ? (typeof stats.vulnerabilities === "number" ? stats.vulnerabilities : 0) :
                   t.key === "endpoints" ? stats.endpoints : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {currentTab && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-surface-2 border border-white/5 mb-4">
          <p className="text-[11px] text-text-dim/80 leading-relaxed">
            {currentTab.desc}
            <br />
            <span className="text-accent/70">{tabLearn[currentTab.key]}</span>
          </p>
        </div>
      )}

      <div className="animate-fade-in">
        {tab === "subdomains" && <SubdomainList targetId={Number(id)} />}
        {tab === "hosts" && <LiveHostList targetId={Number(id)} />}
        {tab === "vulns" && <VulnerabilityList targetId={Number(id)} />}
        {tab === "endpoints" && <EndpointList targetId={Number(id)} />}
        {tab === "manual" && (
          <ManualWorkspace targetId={Number(id)} host={target?.target || ""} />
        )}
      </div>
    </div>
  );
}
