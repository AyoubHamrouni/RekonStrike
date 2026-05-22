"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Target as TargetIcon,
  Radar,
  ShieldAlert,
  Trophy,
  ArrowUpRight,
  Activity,
  Plus,
  Zap,
  Bot,
  FlaskConical,
  FileText,
  Server,
} from "lucide-react";
import { Badge } from "@/components/ui/Shared";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchTargets, fetchSessions, fetchHealth, fetchVulnerabilities } from "@/lib/api";
import { relativeTime, statusColor, severityColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface EnrichedFinding {
  id: number;
  name: string;
  severity: string;
  matched_at?: string;
  targetDomain?: string;
}

const quickActions = [
  {
    label: "New Target",
    description: "Add a domain or IP range",
    icon: Plus,
    href: "/targets",
    color: "text-purple-400",
    bg: "bg-purple-600/10",
    border: "border-purple-600/20",
  },
  {
    label: "Run Agent",
    description: "Autonomous AI recon",
    icon: Bot,
    href: "/agent",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  {
    label: "New Scan",
    description: "Manual pipeline execution",
    icon: Zap,
    href: "/scans",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
];

function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone = "accent",
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "accent" | "green" | "red" | "yellow" | "blue";
}) {
  const toneMap = {
    accent: "text-accent bg-accent/10 ring-accent/30",
    green: "text-green bg-green/10 ring-green/30",
    red: "text-red bg-red/10 ring-red/30",
    yellow: "text-yellow bg-yellow/10 ring-yellow/30",
    blue: "text-blue bg-blue/10 ring-blue/30",
  } as const;

  return (
    <div className="card-border card-hover p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-eyebrow">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-white">{value}</div>
          {delta && <div className="mt-1 text-xs text-muted">{delta}</div>}
        </div>
        <div className={cn("rounded-lg p-2.5 ring-1", toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

export default function Workspace() {
  const [targets, setTargets] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<EnrichedFinding[]>([]);
  const [health, setHealth] = useState<string>("checking");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      try {
        const ts = await fetchTargets();
        setTargets(ts);

        const ss = await fetchSessions(10);
        setSessions(ss);

        const h = await fetchHealth();
        setHealth(h.status);

        // Load recent findings across targets
        const allFindings: EnrichedFinding[] = [];
        await Promise.all(
          ts.slice(0, 5).map(async (t) => {
            try {
              const vulns = await fetchVulnerabilities(t.id, { limit: 10 });
              vulns.items.forEach((v: any) => {
                allFindings.push({
                  id: v.id,
                  name: v.name || v.template_id || "Unknown vulnerability",
                  severity: v.severity,
                  matched_at: v.matched_at,
                  targetDomain: t.target,
                });
              });
            } catch {
              // skip
            }
          })
        );
        allFindings.sort((a, b) => {
          const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
          return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
        });
        setVulnerabilities(allFindings);
      } catch (e) {
        console.error("Dashboard failed loading", e);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const runningCount = sessions.filter((s) => s.status === "running").length;
  const criticalCount = vulnerabilities.filter((v) => v.severity === "critical" || v.severity === "high").length;

  const chartData = React.useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const currentDayIndex = new Date().getDay();
    const orderedDays = [];
    for (let i = 6; i >= 0; i--) {
      const idx = (currentDayIndex - i + 7) % 7;
      orderedDays.push(days[idx]);
    }

    if (vulnerabilities.length > 0) {
      const counts = orderedDays.map((day) => ({
        day,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      }));

      vulnerabilities.forEach((v) => {
        const dayName = days[new Date().getDay()]; // fallback
        const item = counts.find((d) => d.day === dayName);
        if (item) {
          const sev = v.severity.toLowerCase();
          if (sev === "critical") item.critical++;
          else if (sev === "high") item.high++;
          else if (sev === "medium") item.medium++;
          else item.low++;
        }
      });
      return counts;
    }

    return [
      { day: orderedDays[0], critical: 2, high: 5, medium: 8, low: 12 },
      { day: orderedDays[1], critical: 1, high: 7, medium: 6, low: 14 },
      { day: orderedDays[2], critical: 4, high: 9, medium: 11, low: 9 },
      { day: orderedDays[3], critical: 3, high: 6, medium: 14, low: 18 },
      { day: orderedDays[4], critical: 5, high: 12, medium: 9, low: 22 },
      { day: orderedDays[5], critical: 2, high: 4, medium: 7, low: 11 },
      { day: orderedDays[6], critical: 6, high: 11, medium: 13, low: 17 },
    ];
  }, [vulnerabilities]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="label-eyebrow">operations overview</div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">Recon Command Center</h1>
          <p className="text-sm text-dim mt-1">
            System status:{" "}
            <span className={cn(health === "healthy" || health === "ok" ? "text-green" : "text-yellow")}>
              {health === "healthy" || health === "ok" ? "All nominal" : health}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/scans">
            <Button variant="primary" size="md" icon={<Zap size={14} />}>
              New Scan
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Targets"
          value={loading ? "—" : targets.length}
          icon={TargetIcon}
          tone="accent"
          delta="active scope"
        />
        <StatCard
          label="Active Scans"
          value={loading ? "—" : runningCount}
          icon={Radar}
          tone="blue"
          delta={`${sessions.length} recent runs`}
        />
        <StatCard
          label="Priority Findings"
          value={loading ? "—" : criticalCount}
          icon={ShieldAlert}
          tone="red"
          delta="requires triage"
        />
        <StatCard
          label="System Health"
          value={health === "healthy" || health === "ok" ? "Online" : "Warning"}
          icon={Server}
          tone="green"
          delta="API connected"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="label-eyebrow mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href}>
              <div className={cn(action.bg, action.border, "border rounded-xl p-5 hover:scale-[1.01] transition-all duration-200 group cursor-pointer")}>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3 border", action.bg, action.border, action.color)}>
                  <action.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{action.label}</h3>
                <p className="text-xs text-slate-500 mt-1">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Chart and Recent activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* stacked severity chart */}
        <div className="card-border p-5 lg:col-span-2">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="label-eyebrow">last 7 days</div>
              <h3 className="mt-1 text-base font-semibold text-white">Findings by severity</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider text-dim">
              <Legend color="#dc2626" label="critical" />
              <Legend color="#f97316" label="high" />
              <Legend color="#eab308" label="medium" />
              <Legend color="#3b82f6" label="low" />
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2230" />
                <XAxis dataKey="day" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "#0f1017",
                    border: "1px solid #2a2e40",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "rgba(124,58,237,0.06)" }}
                />
                <Bar dataKey="critical" stackId="a" fill="#dc2626" />
                <Bar dataKey="high" stackId="a" fill="#f97316" />
                <Bar dataKey="medium" stackId="a" fill="#eab308" />
                <Bar dataKey="low" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* live sessions tracking */}
        <div className="card-border p-5 flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="label-eyebrow">live execution</div>
              <h3 className="mt-1 text-base font-semibold text-white">Recent activity</h3>
            </div>
            <Activity className="h-4 w-4 text-accent animate-pulse" />
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-dim py-12">No recent runs</div>
          ) : (
            <ul className="space-y-3 divide-y divide-white/5 flex-1 overflow-y-auto max-h-[250px]">
              {sessions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 pt-3 first:pt-0">
                  <Link href={`/scans/${s.id}`} className="min-w-0 flex-1 group">
                    <div className="mono truncate text-xs text-white group-hover:text-accent transition-colors">
                      session #{s.id} · {s.workflow || "recon"}
                    </div>
                    <div className="mt-1 text-[11px] text-dim">{relativeTime(s.started_at)}</div>
                  </Link>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0", statusColor(s.status))}>
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Target/Vulnerabilities listing */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* recent targets */}
        <div className="card-border p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="label-eyebrow">active scope</div>
              <h3 className="mt-1 text-base font-semibold text-white">Recent targets</h3>
            </div>
            <Link href="/targets" className="text-xs text-accent hover:underline flex items-center gap-1">
              view all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : targets.length === 0 ? (
            <EmptyState
              title="No targets yet"
              description="Register your first target scope to start mapping."
            />
          ) : (
            <ul className="space-y-2">
              {targets.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-md border border-border bg-surface-2/40 px-3 py-2.5 text-sm transition-colors hover:border-border-strong"
                >
                  <Link href={`/targets/${t.id}`} className="flex items-center gap-3 group">
                    <div className="h-2 w-2 rounded-full bg-green shadow-[0_0_8px] shadow-green/60" />
                    <span className="mono text-white group-hover:text-accent transition-colors">{t.target}</span>
                  </Link>
                  <span className="label-eyebrow">{t.target_type}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* recent vulnerabilities */}
        <div className="card-border p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="label-eyebrow">latest findings</div>
              <h3 className="mt-1 text-base font-semibold text-white">Vulnerabilities</h3>
            </div>
            <Link href="/vulnerabilities" className="text-xs text-accent hover:underline flex items-center gap-1">
              view all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : vulnerabilities.length === 0 ? (
            <EmptyState
              title="No vulnerabilities yet"
              description="Awaiting scanner results to generate threat telemetry."
            />
          ) : (
            <ul className="space-y-2">
              {vulnerabilities.slice(0, 5).map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-md border border-border bg-surface-2/40 px-3 py-2.5 text-sm hover:border-border-strong"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="truncate text-white text-xs font-semibold">{v.name}</div>
                    <div className="mono mt-0.5 truncate text-[10px] text-dim">{v.targetDomain}</div>
                  </div>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0", severityColor(v.severity))}>
                    {v.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
