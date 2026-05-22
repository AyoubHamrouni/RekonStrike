"use client";

import { Brain } from "lucide-react";

export function StrategyCard({ strategy }: { strategy: unknown | null }) {
  if (!strategy) return null;
  const pretty =
    typeof strategy === "string" ? strategy : JSON.stringify(strategy, null, 2);
  return (
    <div className="card-border p-5">
      <div className="mb-3 flex items-center gap-2">
        <Brain className="h-4 w-4 text-accent" />
        <div className="label-eyebrow">strategy</div>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-terminal p-3 font-mono text-[11px] leading-relaxed text-white">
        {pretty}
      </pre>
    </div>
  );
}
