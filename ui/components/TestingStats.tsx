"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Shared";
import type { TestingSession, TestingFinding } from "@/types";

interface TestingStatsProps {
  session: TestingSession;
  onPause: () => void;
  onComplete: () => void;
}

export function TestingStats({ session, onPause, onComplete }: TestingStatsProps) {
  const riskBreakdown = useMemo(() => {
    const breakdown: Record<string, { total: number; tested: number; confirmed: number }> = {
      critical: { total: 0, tested: 0, confirmed: 0 },
      high: { total: 0, tested: 0, confirmed: 0 },
      medium: { total: 0, tested: 0, confirmed: 0 },
      low: { total: 0, tested: 0, confirmed: 0 },
      info: { total: 0, tested: 0, confirmed: 0 },
    };

    for (const f of session.findings) {
      const rank = f.risk_rank || "info";
      if (breakdown[rank]) {
        breakdown[rank].total++;
        if (f.status === "tested" || f.status === "confirmed" || f.status === "dismissed") {
          breakdown[rank].tested++;
        }
        if (f.status === "confirmed") {
          breakdown[rank].confirmed++;
        }
      }
    }
    return breakdown;
  }, [session]);

  const totalFindings = session.findings.length;
  const isActive = session.status === "active";

  return (
    <Card title="Session Stats">
      <div className="space-y-4">
        <div className="text-xs text-slate-500">
          Session started:{" "}
          {session.started_at
            ? new Date(session.started_at).toLocaleString()
            : "—"}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Findings tested</span>
            <span className="text-slate-200 font-bold">
              {session.findings_tested}/{totalFindings}
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div
              className="bg-purple-500 h-1.5 rounded-full transition-all"
              style={{
                width: totalFindings > 0
                  ? `${(session.findings_tested / totalFindings) * 100}%`
                  : "0%",
              }}
            />
          </div>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Confirmed</span>
          <span className="text-emerald-400 font-bold">{session.findings_confirmed}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Dismissed</span>
          <span className="text-slate-500 font-bold">
            {session.findings_tested - session.findings_confirmed}
          </span>
        </div>

        <div className="border-t border-white/5 pt-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Risk Summary
          </div>
          {Object.entries(riskBreakdown).map(([risk, data]) =>
            data.total > 0 ? (
              <div key={risk} className="flex justify-between text-xs py-1">
                <span className="capitalize text-slate-400">{risk}</span>
                <span className="text-slate-500">
                  {data.confirmed} confirmed / {data.total} total
                </span>
              </div>
            ) : null
          )}
        </div>

        {isActive && (
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={onPause}>
              Pause
            </Button>
            <Button variant="danger" size="sm" onClick={onComplete}>
              Complete
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
