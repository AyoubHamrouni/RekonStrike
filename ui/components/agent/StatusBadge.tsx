"use client";

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    running: "border-accent/40 bg-accent/10 text-accent",
    completed: "border-green/40 bg-green/10 text-green",
    error: "border-red/40 bg-red/10 text-red",
    failed: "border-red/40 bg-red/10 text-red",
    interrupted: "border-yellow/40 bg-yellow/10 text-yellow",
    cancelled: "border-yellow/40 bg-yellow/10 text-yellow",
    idle: "border-border bg-surface-2 text-dim",
    starting: "border-blue/40 bg-blue/10 text-blue",
  };
  const cls = map[s] ?? "border-border bg-surface-2 text-dim";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {s === "running" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {status}
    </span>
  );
}
