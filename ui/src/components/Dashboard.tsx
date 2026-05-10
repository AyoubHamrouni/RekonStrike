import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Crosshair,
  Target as TargetIcon,
  Shield,
  Globe,
  ArrowRight,
  Activity,
  BarChart3,
  Bot,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import toast from "react-hot-toast";
import StatCard from "./ui/StatCard";
import EmptyState from "./ui/EmptyState";
import ErrorState from "./ui/ErrorState";
import { SkeletonCard, SkeletonTable } from "./ui/Skeleton";
import { fetchTargets, fetchStats, fetchSessions } from "../api";
import type { Target, Session, Stats } from "../types";

// ── SessionBadge ─────────────────────────────────────────────────────────

const sessionBadgeStyles: Record<string, string> = {
  running: "bg-green/10 text-green border-green/20",
  completed: "bg-blue/10 text-blue border-blue/20",
  failed: "bg-red/10 text-red border-red/20",
  cancelled: "bg-yellow/10 text-yellow border-yellow/20",
};

function SessionBadge({ status }: { status: string }) {
  const s = sessionBadgeStyles[status] || "bg-surface-2 text-text-dim border-white/5";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${s}`}
    >
      {status === "running" && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-green animate-pulse-dot"
          aria-hidden="true"
        />
      )}
      {status}
    </span>
  );
}

// ── VulnerabilityChart ───────────────────────────────────────────────────

const severityColors: Record<string, string> = {
  critical: "#e05a4f",
  high: "#f0b429",
  medium: "#4a9eff",
  low: "#7c7e94",
  info: "#00d4aa",
};

function VulnerabilityChart({
  data,
  loading,
}: {
  data: Record<string, number>;
  loading: boolean;
}) {
  const pieData = Object.entries(data || {}).map(([name, value]) => ({
    name,
    value,
    color: severityColors[name] || "#7c7e94",
  }));

  if (loading) {
    return (
      <div className="bg-surface border border-white/5 rounded-xl p-5">
        <div className="skeleton h-4 w-44 rounded mb-4" />
        <div className="flex items-center gap-6">
          <div className="skeleton w-[140px] h-[140px] rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-3 w-24 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!pieData.length) {
    return (
      <div className="bg-surface border border-white/5 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-accent" />
          Vulnerability Distribution
        </h3>
        <div className="flex items-center justify-center py-8 text-text-dim text-xs">
          No vulnerability data yet
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-white/5 rounded-xl p-5 transition-all duration-200 hover:border-white/10">
      <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
        <BarChart3 size={16} className="text-accent" />
        Vulnerability Distribution
      </h3>
      <div className="flex items-center gap-6">
        <div className="shrink-0">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={60}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1.5">
          {pieData.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: d.color }}
              />
              <span className="text-text-dim capitalize">{d.name}</span>
              <span className="font-medium text-text ml-auto">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ScanActivityChart ────────────────────────────────────────────────────

function ScanActivityChart({
  sessions,
  loading,
}: {
  sessions: Session[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-surface border border-white/5 rounded-xl p-5">
        <div className="skeleton h-4 w-28 rounded mb-4" />
        <div className="skeleton h-32 rounded" />
      </div>
    );
  }

  if (!sessions?.length) {
    return (
      <div className="bg-surface border border-white/5 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
          <Activity size={16} className="text-accent" />
          Scan Activity
        </h3>
        <div className="flex items-center justify-center py-8 text-text-dim text-xs">
          No scans yet
        </div>
      </div>
    );
  }

  const data = sessions.slice(0, 10).reverse();
  const statusCounts: Record<string, number> = {};
  sessions.forEach((s) => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });

  const barFill = (status: string) => {
    if (status === "completed") return "#00d4aa";
    if (status === "failed") return "#e05a4f";
    if (status === "running") return "#f0b429";
    return "#7c7e94";
  };

  return (
    <div className="bg-surface border border-white/5 rounded-xl p-5 transition-all duration-200 hover:border-white/10">
      <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
        <Activity size={16} className="text-accent" />
        Scan Activity
      </h3>
      <div className="flex gap-4 mb-4 flex-wrap">
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} className="flex items-center gap-2 text-xs">
            <span className="text-text-dim capitalize">{status}</span>
            <span className="font-bold text-text">{count}</span>
          </div>
        ))}
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="id" hide />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "#1a1b26",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(_value, _name, props) => [
                props.payload.status,
                "Status",
              ]}
            />
            <Bar dataKey="status" radius={[3, 3, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.id} fill={barFill(entry.status)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetStats, setTargetStats] = useState<Record<number, Stats>>({});
  const [statsLoading, setStatsLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchTargets(), fetchSessions(20)])
      .then(([ts, ss]) => {
        setTargets(ts);
        setSessions(ss);
        if (ts.length > 0) {
          setStatsLoading(true);
          Promise.all(
            ts.slice(0, 5).map((t) =>
              fetchStats(t.id).then((s) => ({ id: t.id, ...s })).catch(() => null)
            )
          )
            .then((statsArr) => {
              const m: Record<number, Stats> = {};
              statsArr.forEach((s) => {
                if (s) m[s.id] = s;
              });
              setTargetStats(m);
            })
            .finally(() => setStatsLoading(false));
        }
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load dashboard data");
        toast.error("Failed to load dashboard data");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalSubs = Object.values(targetStats).reduce(
    (a, b) => a + (b.subdomains || 0),
    0
  );
  const totalLive = Object.values(targetStats).reduce(
    (a, b) => a + (b.live_hosts || 0),
    0
  );
  const totalVulns = Object.values(targetStats).reduce((a, b) => {
    const v = b.vulnerabilities;
    if (typeof v === "number") return a + v;
    if (typeof v === "object") return a + Object.values(v).reduce((s, c) => s + c, 0);
    return a;
  }, 0);
  const totalEndpoints = Object.values(targetStats).reduce(
    (a, b) => a + (b.endpoints || 0),
    0
  );
  const activeScans = sessions.filter((s) => s.status === "running").length;

  const vulnDistribution: Record<string, number> = {};
  Object.values(targetStats).forEach((s) => {
    const v = s.vulnerabilities;
    if (typeof v === "object") {
      Object.entries(v).forEach(([sev, count]) => {
        vulnDistribution[sev] = (vulnDistribution[sev] || 0) + count;
      });
    }
  });

  if (error) {
    return (
      <ErrorState title="Failed to load dashboard" message={error} onRetry={load} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Dashboard</h1>
          <p className="text-sm text-text-dim mt-1">Attack surface overview</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/agent"
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-border text-text rounded-lg text-sm font-medium transition-colors"
          >
            <Bot size={16} />
            Agent
          </Link>
          <Link
            to="/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Crosshair size={16} />
            New Scan
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Active scan banner */}
      {activeScans > 0 && (
        <div className="bg-green/5 border border-green/20 rounded-xl p-4 flex items-center gap-3 animate-fade-in">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-green animate-pulse-dot" />
          </div>
          <div className="text-sm">
            <span className="font-medium text-green">
              {activeScans} scan{activeScans > 1 ? "s" : ""} running
            </span>
            <span className="text-text-dim ml-2">
              — Results update in real-time
            </span>
          </div>
        </div>
      )}

      {/* Stat cards: 4 columns */}
      {loading ? (
        <div className="grid grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      ) : targets.length > 0 ? (
        <>
          <div className="grid grid-cols-4 gap-6">
            <StatCard
              icon={Globe}
              label="Total Subdomains"
              value={totalSubs}
              color="bg-accent-subtle"
              loading={statsLoading}
            />
            <StatCard
              icon={TargetIcon}
              label="Live Hosts"
              value={totalLive}
              color="bg-green-subtle"
              loading={statsLoading}
            />
            <StatCard
              icon={Shield}
              label="Vulnerabilities"
              value={totalVulns}
              color="bg-red-subtle"
              loading={statsLoading}
            />
            <StatCard
              icon={BarChart3}
              label="Crawled Endpoints"
              value={totalEndpoints}
              color="bg-blue-subtle"
              loading={statsLoading}
            />
          </div>

          {/* Charts row: 2 columns */}
          <div className="grid grid-cols-2 gap-6">
            <VulnerabilityChart data={vulnDistribution} loading={statsLoading} />
            <ScanActivityChart sessions={sessions} loading={loading} />
          </div>

          {/* Targets table */}
          <div className="bg-surface border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Targets</h2>
              <span className="text-xs text-text-dim">
                {targets.length} total
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {targets.map((t) => {
                const s = targetStats[t.id];
                return (
                  <Link
                    key={t.id}
                    to={`/target/${t.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text truncate">
                          {t.target}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-text-dim font-medium shrink-0">
                          {t.target_type}
                        </span>
                      </div>
                      <div className="text-xs text-text-dim mt-0.5">
                        Added {t.created_at?.slice(0, 10)}
                      </div>
                    </div>
                    {s && (
                      <div className="flex items-center gap-4 text-xs text-text-dim shrink-0">
                        <span>{s.subdomains ?? "?"} subs</span>
                        <span>{s.live_hosts ?? "?"} live</span>
                        <span
                          className={
                            (typeof s.vulnerabilities === "number"
                              ? s.vulnerabilities
                              : 0) > 0
                              ? "text-red"
                              : ""
                          }
                        >
                          {typeof s.vulnerabilities === "number"
                            ? s.vulnerabilities
                            : "?"}{" "}
                          vulns
                        </span>
                      </div>
                    )}
                    <ArrowRight
                      size={14}
                      className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Recent sessions */}
          <div className="bg-surface border border-white/5 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Recent Scans</h2>
              <span className="text-xs text-text-dim">
                {sessions.length} total
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {sessions.slice(0, 10).map((s) => (
                <Link
                  key={s.id}
                  to={`/scan/${s.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text">
                        Session #{s.id}
                      </span>
                      <SessionBadge status={s.status} />
                    </div>
                    <div className="text-xs text-text-dim mt-0.5">
                      {s.started_at
                        ? new Date(s.started_at).toLocaleString()
                        : "—"}
                      {s.current_phase && ` · Phase ${s.current_phase}`}
                    </div>
                  </div>
                  <ArrowRight
                    size={14}
                    className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  />
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          icon={Crosshair}
          title="No targets yet"
          message="Start your first reconnaissance scan to discover subdomains, live hosts, and vulnerabilities."
          action={
            <Link
              to="/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Crosshair size={16} />
              Start Your First Scan
            </Link>
          }
        />
      )}
    </div>
  );
}
