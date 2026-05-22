"use client";

import Link from "next/link";
import { CheckCircle2, XCircle, AlertTriangle, ArrowLeft, FileText } from "lucide-react";

export function CompletionBanner({
  status,
  error,
  state,
}: {
  status: string;
  error?: string;
  state: Record<string, unknown> | null;
}) {
  const map = {
    completed: {
      icon: CheckCircle2,
      border: "border-green/40",
      bg: "bg-green/10",
      text: "text-green",
      title: "Run completed",
    },
    error: {
      icon: XCircle,
      border: "border-red/40",
      bg: "bg-red/10",
      text: "text-red",
      title: "Run failed",
    },
    interrupted: {
      icon: AlertTriangle,
      border: "border-yellow/40",
      bg: "bg-yellow/10",
      text: "text-yellow",
      title: "Run interrupted",
    },
  } as const;
  const s = (status in map ? status : "completed") as keyof typeof map;
  const cfg = map[s];
  const Icon = cfg.icon;

  return (
    <div className={`card-border p-5 ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cfg.text}`} />
        <div className="flex-1">
          <h3 className={`text-sm font-semibold ${cfg.text}`}>{cfg.title}</h3>
          {error && <p className="mt-1 text-xs text-muted">{error}</p>}
          {state && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="label-eyebrow">subdomains</div>
                <div className="mt-0.5 font-mono text-sm text-white">
                  {(state.subdomains as number) ?? 0}
                </div>
              </div>
              <div className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="label-eyebrow">live hosts</div>
                <div className="mt-0.5 font-mono text-sm text-white">
                  {(state.live_hosts as number) ?? 0}
                </div>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/agent"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-white hover:border-border-strong transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back to Agent
            </Link>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
            >
              <FileText className="h-3 w-3" /> Open reports
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
