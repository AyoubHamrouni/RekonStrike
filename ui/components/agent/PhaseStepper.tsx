"use client";

import { Check, X, Circle } from "lucide-react";

const PHASES = [
  { key: "phase_0_validate", label: "Validate" },
  { key: "phase_1_passive", label: "Passive recon" },
  { key: "phase_3_httpprobe", label: "HTTP probe" },
  { key: "phase_4_content", label: "Content discovery" },
  { key: "phase_5_vulnscan", label: "Vulnerability scan" },
  { key: "phase_6_scoring", label: "Scoring" },
];

export function PhaseStepper({
  currentPhase,
  completedPhases,
  failedPhases,
}: {
  currentPhase: string | null;
  completedPhases: string[];
  failedPhases: string[];
}) {
  return (
    <div className="card-border p-5">
      <div className="label-eyebrow mb-4">pipeline</div>
      <ol className="space-y-3">
        {PHASES.map((p) => {
          const isCurrent = currentPhase === p.key;
          const isDone = completedPhases.includes(p.key);
          const isFailed = failedPhases.includes(p.key);
          return (
            <li key={p.key} className="flex items-center gap-3">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  isFailed
                    ? "border-red/50 bg-red/10 text-red"
                    : isDone
                      ? "border-green/50 bg-green/10 text-green"
                      : isCurrent
                        ? "border-accent bg-accent/20 text-accent"
                        : "border-border bg-surface-2 text-faint"
                }`}
              >
                {isFailed ? (
                  <X className="h-3 w-3" />
                ) : isDone ? (
                  <Check className="h-3 w-3" />
                ) : isCurrent ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                ) : (
                  <Circle className="h-2 w-2" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm ${
                    isCurrent ? "font-semibold text-white" : isDone ? "text-muted" : "text-dim"
                  }`}
                >
                  {p.label}
                </div>
                <div className="font-mono text-[10px] text-faint">{p.key}</div>
              </div>
            </li>
          );
        })}
      </ol>
      {currentPhase && (
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
          <div className="label-eyebrow">currently running</div>
          <div className="mt-0.5 font-mono text-xs text-accent">{currentPhase}</div>
        </div>
      )}
    </div>
  );
}
