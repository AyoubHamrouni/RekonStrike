"use client";

import { useState } from "react";
import {
  Trophy,
  TrendingUp,
  Shield,
  DollarSign,
  ExternalLink,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgramSummary {
  id: number;
  program_name: string;
  program_source: string;
  risk_score: number;
  roi_score: number;
  priority_score: number;
  bounty_min?: number;
  bounty_max?: number;
  recommendation: string;
}

const mockPrograms: ProgramSummary[] = [
  { id: 1, program_name: "Acme Corp", program_source: "hackerone", risk_score: 7.2, roi_score: 8.9, priority_score: 9.1, bounty_min: 500, bounty_max: 15000, recommendation: "high-priority" },
  { id: 2, program_name: "Stripe", program_source: "hackerone", risk_score: 9.4, roi_score: 8.5, priority_score: 8.8, bounty_min: 500, bounty_max: 100000, recommendation: "premium" },
  { id: 3, program_name: "Shopify", program_source: "hackerone", risk_score: 6.8, roi_score: 7.9, priority_score: 8.2, bounty_min: 500, bounty_max: 50000, recommendation: "high-priority" },
  { id: 4, program_name: "Mozilla", program_source: "bugcrowd", risk_score: 5.5, roi_score: 6.2, priority_score: 6.8, bounty_min: 100, bounty_max: 10000, recommendation: "moderate" },
  { id: 5, program_name: "OpenAI", program_source: "bugcrowd", risk_score: 8.1, roi_score: 7.0, priority_score: 7.9, bounty_min: 200, bounty_max: 20000, recommendation: "high-priority" },
  { id: 6, program_name: "Atlassian", program_source: "intigriti", risk_score: 6.0, roi_score: 6.5, priority_score: 6.4, bounty_min: 150, bounty_max: 12000, recommendation: "moderate" },
];

const sourceBadge: Record<string, string> = {
  hackerone: "bg-[#494649]/40 text-white border-[#6b6669]",
  bugcrowd: "bg-orange/10 text-orange border-orange/30",
  intigriti: "bg-blue/10 text-blue border-blue/30",
};

const recBadge: Record<string, string> = {
  premium: "bg-accent/10 text-accent border-accent/30",
  "high-priority": "bg-green/10 text-green border-green/30",
  moderate: "bg-yellow/10 text-yellow border-yellow/30",
};

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3 w-3", tone)} />
        <span className="label-eyebrow">{label}</span>
      </div>
      <div className={cn("mt-1 text-lg font-semibold", tone)}>{value}</div>
    </div>
  );
}

type SortKey = "priority_score" | "roi_score" | "risk_score" | "bounty_max";

export default function ProgramsPage() {
  const [sortBy, setSortBy] = useState<SortKey>("priority_score");

  const sorted = [...mockPrograms].sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label-eyebrow">bug bounty intel</div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">Programs</h1>
          <p className="text-sm text-dim mt-1">
            Analyzed programs ranked by priority. Higher priority = better ROI vs risk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown size={12} className="text-dim" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="text-xs bg-surface border border-border rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-accent/50 cursor-pointer"
          >
            <option value="priority_score">Priority</option>
            <option value="roi_score">ROI</option>
            <option value="risk_score">Risk</option>
            <option value="bounty_max">Bounty</option>
          </select>
        </div>
      </div>

      {/* Program grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((p) => (
          <div key={p.id} className="card-border card-hover group relative overflow-hidden p-5">
            {/* Glow effect */}
            <div className="absolute right-0 top-0 h-32 w-32 -translate-y-12 translate-x-12 rounded-full bg-accent/10 blur-3xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="relative">
              {/* Title row */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white group-hover:text-accent transition-colors">
                    {p.program_name}
                  </h3>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        sourceBadge[p.program_source] ?? "border-border bg-surface-2 text-muted"
                      )}
                    >
                      {p.program_source}
                    </span>
                    <span
                      className={cn(
                        "inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        recBadge[p.recommendation] ?? "border-border bg-surface-2 text-muted"
                      )}
                    >
                      {p.recommendation}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="label-eyebrow">priority</div>
                  <div className="mt-0.5 text-2xl font-bold text-accent">{p.priority_score.toFixed(1)}</div>
                </div>
              </div>

              {/* Metrics */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric icon={TrendingUp} label="ROI" value={p.roi_score.toFixed(1)} tone="text-green" />
                <Metric icon={Shield} label="Risk" value={p.risk_score.toFixed(1)} tone="text-yellow" />
              </div>

              {/* Footer */}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <div className="flex items-center gap-1.5 text-sm">
                  <DollarSign className="h-3.5 w-3.5 text-green" />
                  <span className="mono text-white">
                    ${p.bounty_min?.toLocaleString()} – ${p.bounty_max?.toLocaleString()}
                  </span>
                </div>
                <Trophy className="h-4 w-4 text-accent opacity-60 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Note */}
      <div className="text-center py-4">
        <p className="text-xs text-dim">
          Connect your HackerOne, Bugcrowd, or Intigriti API keys in settings to populate real program data.
        </p>
      </div>
    </div>
  );
}
