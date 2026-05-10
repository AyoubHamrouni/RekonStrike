import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Crosshair, Target, Activity, Shield, Globe, ArrowRight, Clock,
  AlertTriangle, CheckCircle, XCircle, BarChart3, Bot,
} from "lucide-react";
import { fetchTargets, fetchStats, fetchSessions } from "../api";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import EmptyState from "./ui/EmptyState";
import ErrorState from "./ui/ErrorState";
import { SkeletonCard, SkeletonTable } from "./ui/Skeleton";

function StatCard({ icon: Icon, label, value, color, subtitle, loading }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 card-hover animate-fade-in">
      <div className={`p-2 rounded-lg mb-3 w-fit ${color || "bg-surface-2"}`}>
        <Icon size={18} className="text-text" />
      </div>
      {loading ? (
        <>
          <div className="skeleton h-8 w-20 mb-2" />
          <div className="skeleton h-3 w-32" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-text tracking-tight">{value ?? "—"}</div>
          <div className="text-xs text-text-dim mt-1">{label}</div>
          {subtitle && <div className="text-xs text-text-dim/60 mt-0.5">{subtitle}</div>}
        </>
      )}
    </div>
  );
}

function SessionBadge({ status }) {
  const styles = {
    running: "bg-green/10 text-green border-green/20",
    completed: "bg-blue/10 text-blue border-blue/20",
    failed: "bg-red/10 text-red border-red/20",
    cancelled: "bg-yellow/10 text-yellow border-yellow/20",
  };
  const s = styles[status] || "bg-surface-2 text-text-dim border-border";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${s}`}>
      {status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse-dot" aria-hidden="true" />}
      {status}
    </span>
  );
}

function VulnerabilityChart({ data, loading }) {
  const severityColors = {
    critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94", info: "#00d4aa",
  };
  const pieData = Object.entries(data || {}).map(([name, value]) => ({
    name, value,
    color: severityColors[name] || "#7c7e94",
  }));

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="skeleton h-4 w-44 rounded mb-4" />
        <div className="flex items-center gap-6">
          <div className="skeleton w-[140px] h-[140px] rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-3 w-24 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!pieData.length) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
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
    <div className="bg-surface border border-border rounded-xl p-5 card-hover">
      <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
        <BarChart3 size={16} className="text-accent" />
        Vulnerability Distribution
      </h3>
      <div className="flex items-center gap-6">
        <div className="shrink-0">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60}
                paddingAngle={3} dataKey="value" stroke="none">
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
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-text-dim capitalize">{d.name}</span>
              <span className="font-medium text-text ml-auto">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScanActivityChart({ sessions, loading }) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="skeleton h-4 w-28 rounded mb-4" />
        <div className="skeleton h-32 rounded" />
      </div>
    );
  }

  if (!sessions?.length) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
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

  const recent = sessions.slice(0, 10).reverse();
  const data = recent.map((s) => ({ name: s.id, status: s.status }));

  const statusCounts = {};
  sessions.forEach((s) => { statusCounts[s.status] = (statusCounts[s.status] || 0) + 1; });

  return (
    <div className="bg-surface border border-border rounded-xl p-5 card-hover">
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
            <XAxis dataKey="name" hide />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "#1a1b26", border: "1px solid #252634",
                borderRadius: "8px", fontSize: "12px",
              }}
              formatter={(value, name, props) => [props.payload.status, "Status"]}
            />
            <Bar dataKey="status" fill="#6c5ce7" radius={[3, 3, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={
                  entry.status === "completed" ? "#00d4aa" :
                  entry.status === "failed" ? "#e05a4f" :
                  entry.status === "running" ? "#f0b429" : "#7c7e94"
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [targets, setTargets] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [targetStats, setTargetStats] = useState({});
  const [statsLoading, setStatsLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTargets(),
      fetchSessions(20),
    ])
      .then(([ts, ss]) => {
        setTargets(ts);
        setSessions(ss);
        if (ts.length > 0) {
          setStatsLoading(true);
          Promise.all(ts.slice(0, 5).map((t) =>
            fetchStats(t.id).then((s) => ({ id: t.id, ...s })).catch(() => null)
          ))
            .then((statsArr) => {
              const m = {};
              statsArr.forEach((s) => { if (s) m[s.id] = s; });
              setTargetStats(m);
            })
            .finally(() => setStatsLoading(false));
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load dashboard data");
        toast.error("Failed to load dashboard data");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const totalSubs = Object.values(targetStats).reduce((a, b) => a + (b.subdomains || 0), 0);
  const totalLive = Object.values(targetStats).reduce((a, b) => a + (b.live_hosts || 0), 0);
  const totalVulns = Object.values(targetStats).reduce((a, b) => a + (b.vulnerabilities || 0), 0);
  const totalEndpoints = Object.values(targetStats).reduce((a, b) => a + (b.endpoints || 0), 0);
  const activeScans = sessions.filter((s) => s.status === "running").length;

  const vulnDistribution = {};
  Object.values(targetStats).forEach((s) => {
    if (s.vulnerabilities) {
      Object.entries(s.vulnerabilities || {}).forEach(([sev, count]) => {
        vulnDistribution[sev] = (vulnDistribution[sev] || 0) + count;
      });
    }
  });

  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <ErrorState
          title="Failed to load dashboard"
          message={error}
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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

      {activeScans > 0 && (
        <div className="bg-green/5 border border-green/20 rounded-xl p-4 flex items-center gap-3 animate-fade-in">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-green animate-pulse-dot" />
          </div>
          <div className="text-sm">
            <span className="font-medium text-green">{activeScans} scan{activeScans > 1 ? "s" : ""} running</span>
            <span className="text-text-dim ml-2">— Results update in real-time</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} lines={2} />)}
        </div>
      ) : targets.length > 0 ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Globe} label="Total Subdomains" value={totalSubs}
              color="bg-accent-subtle" loading={statsLoading} />
            <StatCard icon={Target} label="Live Hosts" value={totalLive}
              color="bg-green-subtle" loading={statsLoading} />
            <StatCard icon={Shield} label="Vulnerabilities" value={totalVulns}
              color="bg-red-subtle" loading={statsLoading} />
            <StatCard icon={BarChart3} label="Crawled Endpoints" value={totalEndpoints}
              color="bg-blue-subtle" loading={statsLoading} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <VulnerabilityChart data={vulnDistribution} loading={statsLoading} />
            <ScanActivityChart sessions={sessions} loading={loading} />
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Targets</h2>
              <span className="text-xs text-text-dim">{targets.length} total</span>
            </div>
            <div className="divide-y divide-border">
              {targets.map((t) => {
                const s = targetStats[t.id];
                return (
                  <Link key={t.id} to={`/target/${t.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text truncate">{t.target}</span>
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
                        <span className={s.vulnerabilities > 0 ? "text-red" : ""}>
                          {s.vulnerabilities ?? "?"} vulns
                        </span>
                      </div>
                    )}
                    <ArrowRight size={14} className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text">Recent Scans</h2>
              <span className="text-xs text-text-dim">{sessions.length} total</span>
            </div>
            <div className="divide-y divide-border">
              {sessions.slice(0, 10).map((s) => (
                <Link key={s.id} to={`/scan/${s.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text">Session #{s.id}</span>
                      <SessionBadge status={s.status} />
                    </div>
                    <div className="text-xs text-text-dim mt-0.5">
                      {s.started_at ? new Date(s.started_at).toLocaleString() : "—"}
                      {s.current_phase && ` · Phase ${s.current_phase}`}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
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
            <Link to="/new" className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors">
              <Crosshair size={16} />
              Start Your First Scan
            </Link>
          }
        />
      )}
    </div>
  );
}
