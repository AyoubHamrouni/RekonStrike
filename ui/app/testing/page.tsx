"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FlaskConical,
  Bug,
  ArrowRight,
  Plus,
  Play,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Card, Badge } from "@/components/ui/Shared";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchTargets, getTestingSession } from "@/lib/api";
import { statusColor } from "@/lib/format";
import { cn } from "@/lib/utils";

interface EnrichedTarget {
  id: number;
  target: string;
  target_type: string;
  sessionStatus?: string;
  findingsCount?: number;
  confirmedCount?: number;
  loading: boolean;
}

export default function GlobalTestingPage() {
  const [targets, setTargets] = useState<EnrichedTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTestingSessions() {
      setLoading(true);
      setError(null);
      try {
        const ts = await fetchTargets();
        const enriched: EnrichedTarget[] = ts.map((t) => ({
          id: t.id,
          target: t.target,
          target_type: t.target_type,
          loading: true,
        }));
        setTargets(enriched);

        // Fetch session data in parallel per target
        await Promise.all(
          enriched.map(async (t, i) => {
            try {
              const session = await getTestingSession(t.id, 0);
              setTargets((prev) => {
                const next = [...prev];
                if (next[i]) {
                  next[i] = {
                    ...next[i],
                    sessionStatus: session.status || "unstarted",
                    findingsCount: session.findings?.length || 0,
                    confirmedCount: session.findings_confirmed || 0,
                    loading: false,
                  };
                }
                return next;
              });
            } catch {
              setTargets((prev) => {
                const next = [...prev];
                if (next[i]) {
                  next[i] = {
                    ...next[i],
                    sessionStatus: "unstarted",
                    findingsCount: 0,
                    confirmedCount: 0,
                    loading: false,
                  };
                }
                return next;
              });
            }
          })
        );
      } catch (e: any) {
        setError(e.message || "Failed to load targets for testing");
      } finally {
        setLoading(false);
      }
    }

    loadTestingSessions();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div>
        <div className="label-eyebrow">manual verification</div>
        <h1 className="text-2xl font-black text-white tracking-tight mt-1">Testing Workspace</h1>
        <p className="text-sm text-dim mt-1">
          Work through guided checklists, trigger payloads, and confirm vulnerabilities.
        </p>
      </div>

      {loading && targets.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl animate-shimmer" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<FlaskConical size={24} />}
          title="Failed to load testing workspace"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        />
      ) : targets.length === 0 ? (
        <EmptyState
          icon={<FlaskConical size={24} />}
          title="No targets defined yet"
          description="Register targets in the active scope to initialize testing checklists."
          action={
            <Link href="/targets">
              <Button variant="primary" size="sm" icon={<Plus size={12} />}>
                Add Target
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {targets.map((t) => {
            const hasSession = t.sessionStatus && t.sessionStatus !== "unstarted";
            return (
              <div key={t.id} className="card-border card-hover p-5 flex flex-col justify-between group relative overflow-hidden">
                <div className="absolute right-0 top-0 h-24 w-24 -translate-y-10 translate-x-10 rounded-full bg-accent/5 blur-2xl transition-opacity group-hover:opacity-100" />
                
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-white truncate group-hover:text-accent transition-colors font-mono">
                        {t.target}
                      </h3>
                      <span className="label-eyebrow mt-1 block">{t.target_type}</span>
                    </div>
                    {t.loading ? (
                      <Loader2 size={14} className="animate-spin text-dim" />
                    ) : (
                      <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0", statusColor(t.sessionStatus || "unstarted"))}>
                        {t.sessionStatus}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-4">
                    <div className="bg-surface-2/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] uppercase tracking-wider text-dim">threats</div>
                      <div className="text-lg font-bold text-white mt-0.5">
                        {t.loading ? "—" : t.findingsCount}
                      </div>
                    </div>
                    <div className="bg-surface-2/40 border border-white/5 rounded-lg p-2.5">
                      <div className="text-[9px] uppercase tracking-wider text-dim">confirmed</div>
                      <div className="text-lg font-bold text-rose-500 mt-0.5">
                        {t.loading ? "—" : t.confirmedCount}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Bug size={10} /> guided testing
                  </span>
                  
                  <Link href={`/targets/${t.id}/testing`}>
                    <Button
                      variant={hasSession ? "primary" : "ghost"}
                      size="sm"
                      icon={hasSession ? <Play size={12} fill="currentColor" /> : <Plus size={12} />}
                    >
                      {hasSession ? "Enter Workspace" : "Start Session"}
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
