"use client";

import { Lightbulb } from "lucide-react";

interface GuidanceItem {
  id: string;
  ts: string;
  text: string;
  node?: string;
}

export function GuidancePanel({ guidance }: { guidance: GuidanceItem[] }) {
  return (
    <div className="card-border p-5">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-green" />
        <div className="label-eyebrow">guidance</div>
      </div>
      {guidance.length === 0 ? (
        <p className="text-xs text-dim">No triage guidance yet.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {guidance.map((g) => (
            <li
              key={g.id}
              className="rounded-md border border-border bg-surface-2/40 p-2.5 text-xs"
            >
              {g.node && (
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-accent">
                  {g.node}
                </div>
              )}
              <div className="text-white">{g.text}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
