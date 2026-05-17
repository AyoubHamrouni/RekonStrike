import { MessageSquare, Brain, Sparkles } from "lucide-react";
import type { AgentGuidance } from "../../types";
import { useAutoScroll } from "../../hooks/useAutoScroll";

interface GuidanceLogProps {
  items: AgentGuidance[];
}

const MAX_VISIBLE_HEIGHT = 520;

export default function GuidanceLog({ items }: GuidanceLogProps) {
  const { containerRef, autoScroll, setAutoScroll } = useAutoScroll({
    deps: [items],
  });

  return (
    <div className="border border-white/5 rounded-xl flex flex-col" style={{ backgroundColor: "var(--color-surface)" }}>
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text)" }}>
          <MessageSquare size={16} style={{ color: "var(--color-accent)" }} />
          Guidance Log
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
            {items.length} messages
          </span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className="text-xs transition-colors"
            style={{
              color: autoScroll ? "var(--color-accent)" : "var(--color-text-dim)",
            }}
          >
            {autoScroll ? "Auto ON" : "Auto OFF"}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="terminal-panel overflow-y-auto mx-4 mb-4 mt-3"
        style={{ maxHeight: MAX_VISIBLE_HEIGHT, padding: "14px 16px" }}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: "var(--color-text-dim)" }}>
            <MessageSquare size={24} className="mb-2 opacity-40" />
            <p className="text-sm">Waiting for agent guidance...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="animate-fade-in">
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: "var(--color-green)" }} className="text-xs">$</span>
                  {item.node === "strategy" ? (
                    <Brain size={11} className="shrink-0" style={{ color: "var(--color-accent)" }} />
                  ) : (
                    <Sparkles size={11} className="shrink-0" style={{ color: "var(--color-blue)" }} />
                  )}
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: item.node === "strategy" ? "var(--color-accent)" : "var(--color-blue)" }}
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
