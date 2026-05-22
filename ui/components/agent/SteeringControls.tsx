"use client";

import { PauseCircle, Square, PlayCircle } from "lucide-react";
import type { AgentStatus } from "@/types";

type FeedbackAction = "interrupt" | "stop" | "continue";

export function SteeringControls({
  status,
  onAction,
}: {
  status: AgentStatus;
  onAction: (a: FeedbackAction) => void;
}) {
  const running = status === "running";
  return (
    <div className="card-border p-5">
      <div className="label-eyebrow mb-3">control</div>
      <div className="grid grid-cols-3 gap-2">
        <button
          disabled={!running}
          onClick={() => onAction("interrupt")}
          className="inline-flex flex-col items-center gap-1 rounded-md border border-red/40 bg-red/10 px-2 py-3 text-xs font-medium text-red transition-colors hover:bg-red/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PauseCircle className="h-4 w-4" />
          Interrupt
        </button>
        <button
          disabled={!running}
          onClick={() => onAction("stop")}
          className="inline-flex flex-col items-center gap-1 rounded-md border border-red/40 bg-red/10 px-2 py-3 text-xs font-medium text-red transition-colors hover:bg-red/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Square className="h-4 w-4" />
          Stop
        </button>
        <button
          disabled={!running}
          onClick={() => onAction("continue")}
          className="inline-flex flex-col items-center gap-1 rounded-md border border-green/40 bg-green/10 px-2 py-3 text-xs font-medium text-green transition-colors hover:bg-green/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlayCircle className="h-4 w-4" />
          Continue
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-dim">
        Interrupt halts the current phase. Stop ends the session. Continue keeps the agent
        running uninterrupted.
      </p>
    </div>
  );
}
