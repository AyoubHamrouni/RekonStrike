"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { ArrowLeft, Radio, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAgentStream } from "@/hooks/useAgentStream";
import { PhaseStepper } from "@/components/agent/PhaseStepper";
import { StrategyCard } from "@/components/agent/StrategyCard";
import { StreamLog } from "@/components/agent/StreamLog";
import { GuidancePanel } from "@/components/agent/GuidancePanel";
import { SteeringControls } from "@/components/agent/SteeringControls";
import { CompletionBanner } from "@/components/agent/CompletionBanner";
import { StatusBadge } from "@/components/agent/StatusBadge";
import { fetchTargets } from "@/lib/api";
import type { Target } from "@/types";

const CONNECTION_STYLES: Record<string, string> = {
  open: "border-green/40 bg-green/10 text-green",
  reconnecting: "border-yellow/40 bg-yellow/10 text-yellow",
  closed: "border-border bg-surface-2 text-dim",
  connecting: "border-blue/40 bg-blue/10 text-blue",
};

export default function AgentSessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const targetIdFromSearch = searchParams.get("targetId");

  const [targetId, setTargetId] = useState<number | null>(
    targetIdFromSearch ? Number(targetIdFromSearch) : null,
  );
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    fetchTargets()
      .then(setTargets)
      .catch(() => {});
  }, []);

  const stream = useAgentStream(targetId, sessionId);

  const [notified, setNotified] = useState(false);
  useEffect(() => {
    if (notified || !stream.completion) return;
    setNotified(true);
    const s = stream.completion.status;
    if (s === "completed") toast.success("Agent completed");
    else if (s === "interrupted") toast("Agent interrupted", { icon: "⚠️" });
    else toast.error(`Agent error: ${stream.completion.error ?? "unknown"}`);
  }, [stream.completion, notified]);

  const target = useMemo(
    () => targets.find((t) => t.id === targetId) ?? null,
    [targets, targetId],
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader
        eyebrow={`session #${sessionId}`}
        title={target ? target.target : "Live agent session"}
        description="Real-time SSE stream from the agent. Steer or interrupt at any time."
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] uppercase tracking-wider ${
                CONNECTION_STYLES[stream.connectionState] ?? CONNECTION_STYLES.connecting
              }`}
            >
              <Radio className="h-3 w-3" />
              {stream.connectionState}
            </span>
            <StatusBadge status={stream.status} />
            {stream.connectionState === "closed" && stream.status === "running" && (
              <button
                onClick={stream.reconnect}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-white hover:border-border-strong transition-colors"
              >
                <RefreshCw className="h-3 w-3" /> Reconnect
              </button>
            )}
            <Link
              href="/agent"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1 text-xs text-white hover:border-white/10 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </Link>
          </div>
        }
      />

      {!targetId && (
        <div className="card-border p-5">
          <div className="label-eyebrow mb-2">target required</div>
          <p className="mb-3 text-sm text-muted">
            We need to know which target this session belongs to in order to subscribe to its stream.
          </p>
          <select
            className="h-10 w-full max-w-sm rounded-md border border-border bg-bg px-3 text-sm text-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            defaultValue=""
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v) {
                setTargetId(v);
                router.replace(`/agent/session/${sessionId}?targetId=${v}`);
              }
            }}
          >
            <option value="" disabled>
              Select a target…
            </option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.target}
              </option>
            ))}
          </select>
        </div>
      )}

      {targetId && (
        <>
          {stream.completion && (
            <div className="mb-4">
              <CompletionBanner
                status={stream.completion.status}
                error={stream.completion.error}
                state={stream.state}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr_22rem]">
            <div className="space-y-4">
              <PhaseStepper
                currentPhase={stream.currentPhase}
                completedPhases={stream.completedPhases}
                failedPhases={stream.failedPhases}
              />
              <StrategyCard strategy={stream.strategy} />
            </div>

            <StreamLog events={stream.events} />

            <div className="space-y-4">
              <GuidancePanel guidance={stream.guidance} />
              <SteeringControls
                status={stream.status}
                onAction={(a) => stream.sendFeedback(a)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
