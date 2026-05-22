export function severityColor(s: string): string {
  const norm = s.toLowerCase();
  switch (norm) {
    case "critical":
      return "text-red bg-red/10 border-red/30";
    case "high":
      return "text-orange bg-orange/10 border-orange/30";
    case "medium":
      return "text-yellow bg-yellow/10 border-yellow/30";
    case "low":
      return "text-blue bg-blue/10 border-blue/30";
    default:
      return "text-dim bg-white/5 border-border";
  }
}

export function statusColor(s: string): string {
  const norm = s.toLowerCase();
  if (norm === "running" || norm === "active") return "text-blue bg-blue/10 border-blue/30";
  if (norm === "completed" || norm === "done" || norm === "healthy" || norm === "ok") return "text-green bg-green/10 border-green/30";
  if (norm === "failed" || norm === "error") return "text-red bg-red/10 border-red/30";
  if (norm === "cancelled" || norm === "paused") return "text-dim bg-white/5 border-border";
  return "text-muted bg-white/5 border-border";
}

export function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(Math.max(0, diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}
