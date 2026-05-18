"use client";

import { MessageSquare, Brain, Sparkles } from "lucide-react";
import type { AgentGuidance } from "@/types";
import { useAutoScroll } from "@/hooks/useAutoScroll";

interface GuidanceLogProps {
  items: AgentGuidance[];
}

const MAX_VISIBLE_HEIGHT = 520;

export default function GuidanceLog({ items }: GuidanceLogProps) {
  const { containerRef } = useAutoScroll({ deps: [items] });

  return (
    <div className="bg-surface border border-white/5 rounded-xl flex flex-col">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
          <MessageSquare size={16} className="text-purple-500" />
          Guidance Log
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {items.length} messages
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="terminal-panel overflow-y-auto mx-4 mb-4 mt-3"
        style={{ maxHeight: MAX_VISIBLE_HEIGHT, padding: "14px 16px" }}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <MessageSquare size={24} className="mb-2 opacity-40" />
            <p className="text-sm">Waiting for agent guidance...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="animate-fade-in">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-emerald-400 text-xs">$</span>
                  {item.node === "strategy" ? (
                    <Brain size={11} className="shrink-0 text-purple-500" />
                  ) : (
                    <Sparkles size={11} className="shrink-0 text-blue-500" />
                  )}
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{
                      color:
                        item.node === "strategy"
                          ? "var(--color-accent)"
                          : "var(--color-blue)",
                    }}
                  >
                    {item.node === "strategy" ? "Strategist" : "Triager"}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--color-text-faint)" }}>
                    {item.time}
                  </span>
                </div>
                <p className="text-sm leading-relaxed ml-5" style={{ color: "var(--color-text-dim)" }}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
