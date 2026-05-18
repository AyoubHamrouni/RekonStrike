"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Target,
  Bot,
  Zap,
  Globe,
  Server,
  Shield,
  Activity,
  Plus,
  ArrowRight,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Card, Badge } from "@/components/ui/Shared";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchTargets, fetchSessions, fetchHealth } from "@/lib/api";
import type { Target as TargetType, Session } from "@/types";

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
  icon,
  href,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link href={href}>
      <div className="bg-surface border border-white/5 rounded-xl p-5 hover:border-white/10 hover:bg-white/[0.02] transition-all group cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">
            {label}
          </span>
          <span className="text-slate-500 group-hover:text-slate-400 transition-colors">
            {icon}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-black text-slate-100">{value}</span>
          <ArrowRight
            size={14}
            className="text-slate-700 group-hover:text-purple-400 transition-colors"
          />
        </div>
      </div>
    </Link>
  );
}

function SessionRow({ session }: { session: Session }) {
  const statusColor = (s: string) => {
    switch (s) {
      case "running":
        return "success";
      case "completed":
        return "default";
      case "failed":
        return "danger";
      default:
        return "default";
    }
  };

  return (
    <Link href={`/scans/${session.id}`}>
      <div className="flex items-center justify-between px-5 py-3 rounded-lg hover:bg-white/[0.02] transition-colors group cursor-pointer">
        <div className="flex items-center gap-3 min-w-0">
          <Activity
            size={14}
            className={
              session.status === "running"
                ? "text-emerald-400 animate-pulse"
                : "text-slate-600"
            }
          />
          <div className="min-w-0">
            <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors truncate block">
              Scan #{session.id}
              {session.workflow ? ` — ${session.workflow}` : ""}
            </span>
            <span className="text-[10px] text-slate-600">
              {session.started_at
                ? new Date(session.started_at).toLocaleString()
                : ""}
              {session.current_phase ? ` · ${session.current_phase}` : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant={statusColor(session.status)}>{session.status}</Badge>
          <ChevronRight
            size={14}
            className="text-slate-700 group-hover:text-purple-400 transition-colors"
          />
        </div>
      </div>
    </Link>
  );
}

export default function Workspace() {
  const [targets, setTargets] = useState<TargetType[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [health, setHealth] = useState<string>("checking");
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    fetchTargets()
      .then(setTargets)
      .catch(() => {})
      .finally(() => setTargetsLoading(false));

    fetchSessions(10)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));

    fetchHealth()
      .then((h) => setHealth(h.status))
      .catch(() => setHealth("unreachable"));
  }, []);

  const totalFindings = targets.length;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Workspace
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            System status:{" "}
            <span
              className={
                health === "healthy" || health === "ok"
                  ? "text-emerald-400 font-medium"
                  : "text-amber-400 font-medium"
              }
            >
              {health === "healthy" || health === "ok"
                ? "All nominal"
                : health}
            </span>
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Targets"
          value={targetsLoading ? "—" : targets.length}
          icon={<Target size={16} />}
          href="/targets"
        />
        <StatCard
          label="Active Sessions"
          value={
            sessionsLoading
              ? "—"
              : sessions.filter((s) => s.status === "running").length
          }
          icon={<Activity size={16} />}
          href="/scans"
        />
        <StatCard
          label="Domains Mapped"
          value="—"
          icon={<Globe size={16} />}
          href="/targets"
        />
        <StatCard
          label="System"
          value={
            health === "healthy" || health === "ok" ? "Online" : "Warning"
          }
          icon={<Server size={16} />}
          href="/settings"
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href}>
              <div
                className={`${action.bg} ${action.border} border rounded-xl p-5 hover:scale-[1.02] transition-all duration-200 group cursor-pointer`}
              >
                <div
                  className={`w-10 h-10 rounded-xl ${action.bg} border ${action.border} flex items-center justify-center mb-3 ${action.color}`}
                >
                  <action.icon size={20} />
                </div>
                <h3 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                  {action.label}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {action.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two-column: Recent Activity + Quick Targets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Activity */}
        <Card
          className="lg:col-span-7"
          title="Recent Activity"
          action={
            <Link href="/scans">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          }
        >
          {sessionsLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Run an agent or start a scan to see activity here"
              action={
                <Link href="/agent">
                  <Button variant="primary" size="sm" icon={<Bot size={12} />}>
                    Run Agent
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-white/5 -mx-5">
              {sessions.slice(0, 5).map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </div>
          )}
        </Card>

        {/* Targets quick access */}
        <Card
          className="lg:col-span-5"
          title="Targets"
          action={
            <Link href="/targets">
              <Button variant="ghost" size="sm">
                Manage
              </Button>
            </Link>
          }
        >
          {targetsLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : targets.length === 0 ? (
            <EmptyState
              title="No targets yet"
              description="Add your first target to begin reconnaissance"
              action={
                <Link href="/targets">
                  <Button variant="primary" size="sm" icon={<Plus size={12} />}>
                    Add Target
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-white/5 -mx-5">
              {targets.slice(0, 5).map((t) => (
                <Link key={t.id} href={`/targets/${t.id}`}>
                  <div className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors group cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-purple-600/10 border border-purple-600/20 flex items-center justify-center text-purple-400 shrink-0">
                        <Target size={14} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors truncate block">
                          {t.target}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {t.target_type}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-slate-700 group-hover:text-purple-400 transition-colors shrink-0"
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
