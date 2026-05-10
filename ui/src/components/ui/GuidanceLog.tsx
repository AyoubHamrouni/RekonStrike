import { MessageSquare, Brain, Sparkles } from "lucide-react";
import type { AgentGuidance } from "../../types";
import { useAutoScroll } from "../../hooks/useAutoScroll";

interface GuidanceLogProps {
  items: AgentGuidance[];
}

export default function GuidanceLog({ items }: GuidanceLogProps) {
  const { containerRef, autoScroll, setAutoScroll } = useAutoScroll({
    deps: [items],
  });

  return (
    <div className="bg-surface border border-white/5 rounded-xl flex flex-col">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-text flex items-center gap-2">
          <MessageSquare size={16} className="text-accent" />
          Guidance Log
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-dim">{items.length} messages</span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs transition-colors ${
              autoScroll
                ? "text-accent hover:text-accent-hover"
                : "text-text-dim hover:text-text"
            }`}
          >
            {autoScroll ? "Auto ON" : "Auto OFF"}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-terminal p-4 font-mono"
        style={{ maxHeight: 520 }}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-dim">
            <MessageSquare size={24} className="mb-2 opacity-40" />
            <p className="text-sm">Waiting for agent guidance...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="animate-fade-in">
                <div className="flex items-center gap-2 mb-1">
                  {item.node === "strategy" ? (
                    <Brain size={12} className="text-accent shrink-0" />
                  ) : (
                    <Sparkles size={12} className="text-blue shrink-0" />
                  )}
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      item.node === "strategy" ? "text-accent" : "text-blue"
                    }`}
                  >
                    {item.node === "strategy" ? "Strategist" : "Triager"}
                  </span>
                  <span className="text-[10px] text-text-dim/40">$</span>
                  <span className="text-[10px] text-text-dim/40">
                    {item.time}
                  </span>
                </div>
                <p className="text-sm text-text-dim leading-relaxed ml-5">
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
