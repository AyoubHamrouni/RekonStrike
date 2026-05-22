"use client";

import { useState } from "react";
import {
  FileText,
  Download,
  Search,
  Filter,
  Calendar,
  ShieldAlert,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import Link from "next/link";

interface ReportSummary {
  id: number;
  title: string;
  format: string;
  findings_count: number;
  generated_at: string;
  target?: string;
  severity_breakdown?: { critical: number; high: number; medium: number; low: number };
}

const mockReports: ReportSummary[] = [
  {
    id: 1,
    title: "Acme Corp — Q2 Recon Report",
    format: "pdf",
    findings_count: 23,
    generated_at: new Date(Date.now() - 86400_000).toISOString(),
    target: "acme.com",
    severity_breakdown: { critical: 3, high: 8, medium: 7, low: 5 },
  },
  {
    id: 2,
    title: "Stripe — GraphQL Surface Analysis",
    format: "markdown",
    findings_count: 8,
    generated_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
    target: "api.stripe.com",
    severity_breakdown: { critical: 1, high: 3, medium: 2, low: 2 },
  },
  {
    id: 3,
    title: "Shopify — Subdomain Takeover Audit",
    format: "html",
    findings_count: 4,
    generated_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
    target: "shopify.com",
    severity_breakdown: { critical: 0, high: 2, medium: 1, low: 1 },
  },
];

const fmtColor: Record<string, string> = {
  pdf: "text-red bg-red/10 border-red/30",
  markdown: "text-blue bg-blue/10 border-blue/30",
  html: "text-orange bg-orange/10 border-orange/30",
};

const fmtIcon: Record<string, string> = {
  pdf: "PDF",
  markdown: "MD",
  html: "HTML",
};

export default function ReportsPage() {
  const [search, setSearch] = useState("");

  const filtered = search
    ? mockReports.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.target?.toLowerCase().includes(search.toLowerCase())
      )
    : mockReports;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label-eyebrow">deliverables</div>
          <h1 className="text-2xl font-black text-white tracking-tight mt-1">Reports</h1>
          <p className="text-sm text-dim mt-1">
            Generated reports from testing sessions, ready to submit to your bug bounty platform.
          </p>
        </div>
        <Link href="/vulnerabilities">
          <Button variant="ghost" size="sm" icon={<Bot size={12} />}>
            Generate Report from Findings
          </Button>
        </Link>
      </div>

      {/* Search */}
      {mockReports.length > 0 && (
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports by title or target..."
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-dim focus:outline-none focus:border-accent/50 transition-all font-mono"
          />
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-border p-4 text-center">
          <div className="text-2xl font-bold text-white">{mockReports.length}</div>
          <div className="label-eyebrow mt-1">total reports</div>
        </div>
        <div className="card-border p-4 text-center">
          <div className="text-2xl font-bold text-accent">
            {mockReports.reduce((sum, r) => sum + r.findings_count, 0)}
          </div>
          <div className="label-eyebrow mt-1">total findings</div>
        </div>
        <div className="card-border p-4 text-center">
          <div className="text-2xl font-bold text-green">
            {mockReports.filter((r) => {
              const d = new Date(r.generated_at);
              return Date.now() - d.getTime() < 7 * 86400_000;
            }).length}
          </div>
          <div className="label-eyebrow mt-1">this week</div>
        </div>
      </div>

      {/* Report cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title={search ? "No reports match your search" : "No reports generated"}
          description={
            search
              ? "Try a different search term."
              : "Confirm findings and generate reports from the testing workspace."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="card-border card-hover flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-accent/10 p-3 ring-1 ring-accent/30 shrink-0">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate">{r.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <ShieldAlert size={10} />
                      {r.findings_count} findings
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      {relativeTime(r.generated_at)}
                    </span>
                    {r.target && (
                      <>
                        <span>·</span>
                        <span className="mono">{r.target}</span>
                      </>
                    )}
                  </div>
                  {r.severity_breakdown && (
                    <div className="mt-2 flex items-center gap-2">
                      {r.severity_breakdown.critical > 0 && (
                        <span className="inline-flex items-center gap-1 rounded border border-red/30 bg-red/10 px-1.5 py-0.5 text-[9px] font-bold text-red uppercase">
                          {r.severity_breakdown.critical} crit
                        </span>
                      )}
                      {r.severity_breakdown.high > 0 && (
                        <span className="inline-flex items-center gap-1 rounded border border-orange/30 bg-orange/10 px-1.5 py-0.5 text-[9px] font-bold text-orange uppercase">
                          {r.severity_breakdown.high} high
                        </span>
                      )}
                      {r.severity_breakdown.medium > 0 && (
                        <span className="inline-flex items-center gap-1 rounded border border-yellow/30 bg-yellow/10 px-1.5 py-0.5 text-[9px] font-bold text-yellow uppercase">
                          {r.severity_breakdown.medium} med
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 sm:self-center">
                <span
                  className={cn(
                    "rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
                    fmtColor[r.format] ?? "border-border bg-surface-2 text-muted"
                  )}
                >
                  {r.format}
                </span>
                <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-white hover:border-accent/50 hover:text-accent transition-colors cursor-pointer">
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
