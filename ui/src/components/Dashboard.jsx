import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Crosshair, Target, Activity, Shield, Globe, ArrowRight, Clock, AlertTriangle, CheckCircle, XCircle, BarChart3 } from "lucide-react";
import { fetchTargets, fetchStats, fetchSessions } from "../api";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

function StatCard({ icon: Icon, label, value, color, subtitle }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 card-hover animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} className="text-text" />
        </div>
      </div>
      <div className="text-2xl font-bold text-text tracking-tight">{value ?? "—"}</div>
      <div className="text-xs text-text-dim mt-1">{label}</div>
      {subtitle && <div className="text-xs text-text-dim/60 mt-0.5">{subtitle}</div>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="skeleton h-10 w-10 rounded-lg mb-3" />
      <div className="skeleton h-8 w-20 mb-2" />
      <div className="skeleton h-3 w-32" />
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
      {status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse-dot" />}
      {status}
    </span>
  );
}

function VulnerabilityChart({ data }) {
  const severityColors = {
    critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94", info: "#00d4aa",
  };
  const pieData = Object.entries(data || {}).map(([name, value]) => ({
    name, value,
    color: severityColors[name] || "#7c7e94",
  }));
  if (!pieData.length) return null;

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
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-text-dim capitalize">{d.name}</span>
              <span className="font-medium text-text ml-auto">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScanActivityChart({ sessions }) {
  const recent = (sessions || []).slice(0, 10).reverse();
  const data = recent.map((s) => ({
    name: s.id,
    status: s.status,
  }));
  if (!data.length) return null;

  const statusCounts = {};
  (sessions || []).forEach((s) => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });

  return (
    <div className="bg-surface border border-border rounded-xl p-5 card-hover">
      <h3 className="text-sm font-semibold text-text mb-4 flex items-center gap-2">
        <Activity size={16} className="text-accent" />
        Scan Activity
      </h3>
      <div className="flex gap-4 mb-4">
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
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.status === "completed" ? "#00d4aa" :
                  entry.status === "failed" ? "#e05a4f" :
                  entry.status === "running" ? "#f0b429" : "#7c7e94"} />
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
  const [targetStats, setTargetStats] = useState({});

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchTargets(),
      fetchSessions(20),
    ]).then(([ts, ss]) => {
      setTargets(ts);
      setSessions(ss);
      if (ts.length > 0) {
        Promise.all(ts.slice(0, 5).map((t) =>
          fetchStats(t.id).then((s) => ({ id: t.id, ...s }))
        )).then((statsArr) => {
          const m = {};
          statsArr.forEach((s) => { m[s.id] = s; });
          setTargetStats(m);
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">Dashboard</h1>
          <p className="text-sm text-text-dim mt-1">Attack surface overview</p>
        </div>
        <Link to="/new" className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors">
          <Crosshair size={16} />
          New Scan
          <ArrowRight size={14} />
        </Link>
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
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : targets.length > 0 ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Globe} label="Total Subdomains" value={totalSubs}
              color="bg-accent-subtle" />
            <StatCard icon={Target} label="Live Hosts" value={totalLive}
              color="bg-green-subtle" />
            <StatCard icon={Shield} label="Vulnerabilities" value={totalVulns}
              color="bg-red-subtle" />
            <StatCard icon={BarChart3} label="Crawled Endpoints" value={totalEndpoints}
              color="bg-blue-subtle" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <VulnerabilityChart data={vulnDistribution} />
            <ScanActivityChart sessions={sessions} />
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
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent-subtle flex items-center justify-center mb-4">
            <Crosshair size={28} className="text-accent" />
          </div>
          <h2 className="text-lg font-semibold text-text mb-2">No targets yet</h2>
          <p className="text-sm text-text-dim mb-6 max-w-md">
            Start your first reconnaissance scan to discover subdomains, live hosts, and vulnerabilities.
          </p>
          <Link to="/new" className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors">
            <Crosshair size={16} />
            Start Your First Scan
          </Link>
        </div>
      )}
    </div>
  );
}

