"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Terminal, Trash2 } from "lucide-react";

export interface AgentEvent {
  id: string;
  type: string;
  ts: string;
  payload: unknown;
}

const TYPE_STYLES: Record<string, { border: string; text: string; label: string }> = {
  session: { border: "border-l-blue", text: "text-blue", label: "session" },
  strategy: { border: "border-l-accent", text: "text-accent", label: "strategy" },
  phase: { border: "border-l-yellow", text: "text-yellow", label: "phase" },
  guidance: { border: "border-l-green", text: "text-green", label: "guidance" },
  state: { border: "border-l-blue", text: "text-blue", label: "state" },
  feedback: { border: "border-l-accent", text: "text-accent", label: "feedback" },
  interrupt: { border: "border-l-red", text: "text-red", label: "interrupt" },
  complete: { border: "border-l-green", text: "text-green", label: "complete" },
  error: { border: "border-l-red", text: "text-red", label: "error" },
};

function summarize(e: AgentEvent): string {
  const { type, payload } = e;
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (type === "session") return `Session connected · ${(payload as Record<string, unknown>).session_id ?? ""}`;
  if (type === "strategy") return "Strategy updated";
  if (type === "phase") {
    const p = payload as Record<string, unknown>;
    return `Entering phase: ${p.name ?? p}`;
  }
  if (type === "guidance") {
    const p = payload as Record<string, unknown>;
    const node = p.node ? `[${p.node}] ` : "";
    return `${node}${p.text ?? p.message ?? JSON.stringify(p)}`;
  }
  if (type === "state") {
    const p = payload as Record<string, unknown>;
    return `state · subs=${p.subdomains ?? 0} hosts=${p.live_hosts ?? 0} next=${p.next_action ?? "-"}`;
  }
  if (type === "interrupt") {
    const p = payload as Record<string, unknown>;
    return `Agent interrupted: ${p.reason ?? "unknown"}`;
  }
  if (type === "feedback") {
    const p = payload as Record<string, unknown>;
    return `Feedback: ${p.action ?? ""}${p.message ? ` — ${p.message}` : ""}`;
  }
  if (type === "complete") {
    const p = payload as Record<string, unknown>;
    return `Run complete · ${p.status ?? "done"}${p.error ? ` — ${p.error}` : ""}`;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

export function StreamLog({ events, onClear }: { events: AgentEvent[]; onClear?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    if (stick && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [events, stick]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    setStick(atBottom);
  }

  return (
    <div className="card-border flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-accent" />
          <div className="label-eyebrow">live stream</div>
          <span className="text-[10px] text-faint">{events.length} events</span>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2/40 px-2 py-1 text-[11px] text-muted hover:border-accent/40 hover:text-white transition-colors"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <div className="relative flex-1 min-h-0">
        <div
          ref={ref}
          onScroll={onScroll}
          className="h-full max-h-[520px] space-y-1 overflow-y-auto rounded-md border border-border bg-terminal p-3 font-mono text-xs"
        >
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-dim">
              <div>
                <Terminal className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <div>Waiting for events…</div>
              </div>
            </div>
          ) : (
            events.map((e) => {
              const style = TYPE_STYLES[e.type] ?? {
                border: "border-l-border",
                text: "text-muted",
                label: e.type,
              };
              return (
                <div
                  key={e.id}
                  className={`flex gap-3 border-l-2 ${style.border} bg-surface-2/20 px-3 py-1.5`}
                >
                  <span className="shrink-0 text-faint">{fmtTs(e.ts)}</span>
                  <span className={`shrink-0 uppercase ${style.text}`}>{style.label}</span>
                  <span className="break-all text-white">{summarize(e)}</span>
                </div>
              );
            })
          )}
        </div>
        {!stick && events.length > 0 && (
          <button
            onClick={() => setStick(true)}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-accent/40 bg-accent/20 px-3 py-1 text-[11px] text-accent backdrop-blur hover:bg-accent/30 transition-colors"
          >
            <ArrowDown className="h-3 w-3" /> Scroll to bottom
          </button>
        )}
      </div>
    </div>
  );
}
