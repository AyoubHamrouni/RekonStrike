"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Play,
  Bot,
  Target,
  Clock,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { Card, Badge } from "@/components/ui/Shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchTargets, fetchSessions, startAgentSession } from "@/lib/api";
import type { Target as TargetType, Session } from "@/types";

export default function AgentPage() {
  const router = useRouter();
  const [targets, setTargets] = useState<TargetType[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [goal, setGoal] = useState("find all vulnerabilities");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchTargets()
      .then(setTargets)
      .catch(() => {})
      .finally(() => setTargetsLoading(false));

    fetchSessions(20)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, []);

  const handleStart = async () => {
    if (!selectedTargetId) {
      toast.error("Select a target first");
      return;
    }
    setStarting(true);
    try {
      const session = await startAgentSession(Number(selectedTargetId), {
        goal,
        max_steps: 10,
      });
      toast.success("Agent session started");
      router.push(`/agent/session/${session.session_id}`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to start agent");
    } finally {
      setStarting(false);
    }
  };

  const agentSessions = sessions.filter((s) => s.workflow?.toLowerCase().includes("agent") || !s.workflow);
  const targetOptions = targets.map((t) => ({
    value: String(t.id),
    label: t.target,
  }));

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle size={14} className="text-emerald-400" />;
      case "running":
        return <Loader2 size={14} className="text-purple-400 animate-spin" />;
      case "failed":
        return <XCircle size={14} className="text-rose-400" />;
      default:
        return <Clock size={14} className="text-slate-500" />;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div>
        <h1 className="text-xl font-bold text-slate-200">Agent Reconnaissance</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Autonomous AI-driven recon with strategist/triager intelligence
        </p>
      </div>

      {/* Launch config */}
      <Card title="Launch Configuration">
        {targetsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : targets.length === 0 ? (
          <EmptyState
            title="No targets available"
            description="Create a target before launching the agent"
            action={
              <Link href="/targets">
                <Button variant="primary" size="sm" icon={<Target size={12} />}>
                  Create Target
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-5">
              <Select
                label="Target"
                placeholder="Select a target..."
                options={targetOptions}
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
              />
            </div>
            <div className="sm:col-span-5">
              <Input
                label="Goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                hint="Describe what you want the agent to find"
              />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button
                variant="primary"
                size="lg"
                icon={starting ? undefined : <Play size={14} />}
                loading={starting}
                onClick={handleStart}
                disabled={!selectedTargetId}
                className="w-full"
              >
                {starting ? "Starting..." : "Launch Agent"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Session history */}
      <Card
        title="Session History"
        action={
          <Badge variant="purple">
            {sessions.length} total
          </Badge>
        }
      >
        {sessionsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Launch an agent to start a reconnaissance session"
          />
        ) : (
          <div className="divide-y divide-white/5 -mx-5">
            {sessions.map((s) => (
              <Link
                key={s.id}
                href={`/agent/session/${s.id}`}
              >
                <div className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors group cursor-pointer">
                  <div className="flex items-center gap-3 min-w-0">
                    {statusIcon(s.status)}
                    <div className="min-w-0">
                      <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors truncate block">
                        Session #{s.id}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {s.started_at
                          ? new Date(s.started_at).toLocaleString()
                          : "—"}
                        {s.current_phase ? ` · ${s.current_phase}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge
                      variant={
                        s.status === "completed"
                          ? "success"
                          : s.status === "running"
                            ? "purple"
                            : s.status === "failed"
                              ? "danger"
                              : "default"
                      }
                    >
                      {s.status}
                    </Badge>
                    <ChevronRight
                      size={14}
                      className="text-slate-700 group-hover:text-purple-400 transition-colors"
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
