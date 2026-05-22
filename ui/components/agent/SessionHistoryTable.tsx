"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ChevronRight } from "lucide-react";
import { fetchAgentSessions } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "./StatusBadge";

interface AgentSession {
  id: number;
  status: string;
  target_id?: number;
  config_snapshot?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

function fmtRelative(iso: string) {
  const d = new Date(iso).getTime();
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function SessionHistoryTable({
  targetId,
  targetName,
}: {
  targetId: number | null;
  targetName?: string;
}) {
  const [data, setData] = useState<AgentSession[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) return;
    setIsLoading(true);
    setError(null);
    fetchAgentSessions(targetId)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setIsLoading(false));
  }, [targetId]);

  if (!targetId) return null;

  return (
    <div className="card-border p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="label-eyebrow">recent sessions</div>
          <h3 className="mt-1 text-sm font-semibold text-white">Agent history</h3>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red/30 bg-red/10 p-3 text-xs text-red">
          Failed to load sessions: {error}
        </div>
      )}

      {data && data.length === 0 && (
        <EmptyState
          icon={<Activity className="h-8 w-8 text-accent" />}
          title="No sessions yet"
          description="Launch the agent above to start your first session."
        />
      )}

      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr className="text-[10px] uppercase tracking-wider text-dim">
                <th className="px-4 py-2 font-semibold">Session</th>
                <th className="px-4 py-2 font-semibold">Target</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Started</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-border transition-colors hover:bg-surface-2/50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-white">#{s.id}</td>
                  <td className="px-4 py-3 text-muted">{targetName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-dim">{fmtRelative(s.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/agent/session/${s.id}?targetId=${targetId}`}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Open <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
