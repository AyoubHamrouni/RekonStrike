"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bug, Play, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Card, Badge } from "@/components/ui/Shared";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { TestingStats } from "@/components/TestingStats";
import { ExploitationSteps } from "@/components/ExploitationSteps";
import { TestResultForm } from "@/components/TestResultForm";
import {
  getTestingSession,
  startTestingSession,
  updateTestingSession,
} from "@/lib/api";
import type { TestingSession, TestingFinding, TestResultResponse } from "@/types";

const RISK_COLORS: Record<string, string> = {
  critical: "text-rose-500 border-rose-500/30 bg-rose-500/10",
  high: "text-orange-500 border-orange-500/30 bg-orange-500/10",
  medium: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  low: "text-slate-400 border-slate-500/30 bg-slate-500/10",
  info: "text-blue-400 border-blue-500/30 bg-blue-500/10",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  confirmed: <CheckCircle size={14} className="text-emerald-500" />,
  dismissed: <XCircle size={14} className="text-slate-600" />,
  tested: <Play size={14} className="text-blue-500" />,
  untested: <AlertTriangle size={14} className="text-slate-700" />,
};

export default function TestingWorkspacePage() {
  const params = useParams();
  const targetId = Number(params.id);
  const [session, setSession] = useState<TestingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<TestingFinding | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);

  const loadSession = useCallback(async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      pageRef.current = 0;
    }
    setError(null);
    const currentPage = append ? pageRef.current + 1 : 0;
    try {
      const s = await getTestingSession(targetId, currentPage);
      setSession((prev) => {
        if (!prev || !append) {
          pageRef.current = 0;
          setHasMore(!!s.total_findings && s.total_findings > s.findings.length);
          return s;
        }
        const merged = {
          ...prev,
          ...s,
          findings: [...prev.findings, ...s.findings],
        };
        setHasMore(!!s.total_findings && merged.findings.length < s.total_findings);
        return merged;
      });
      if (s.findings.length > 0 && !append && !selectedFinding) {
        setSelectedFinding(s.findings[0]);
      }
      if (append) pageRef.current = currentPage;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load session";
      if (!session) setError(msg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [targetId, selectedFinding, session]);

  useEffect(() => {
    loadSession();
  }, [targetId]);

  const handleStartSession = async () => {
    setStarting(true);
    try {
      const result = await startTestingSession(targetId);
      setSession({
        session_id: result.session_id,
        findings_tested: 0,
        findings_confirmed: 0,
        findings: (result.findings || []) as TestingFinding[],
        status: result.status,
      });
      if (result.findings?.length > 0) {
        setSelectedFinding(result.findings[0] as TestingFinding);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start session");
    } finally {
      setStarting(false);
    }
  };

  const handleSubmitResult = (result: TestResultResponse) => {
    if (!session) return;
    setSession({
      ...session,
      findings_tested: result.findings_tested,
      findings_confirmed: result.findings_confirmed,
      findings: session.findings.map((f) =>
        f.index === result.finding_id
          ? { ...f, status: result.finding_status as "confirmed" | "dismissed" }
          : f
      ),
    });
    if (selectedFinding && selectedFinding.index === result.finding_id) {
      setSelectedFinding({
        ...selectedFinding,
        status: result.finding_status as "confirmed" | "dismissed",
      });
    }
  };

  const handlePause = async () => {
    try {
      await updateTestingSession(targetId, "paused");
      setSession((s) => (s ? { ...s, status: "paused" } : s));
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to pause session";
      setError(msg);
    }
  };

  const handleComplete = async () => {
    try {
      await updateTestingSession(targetId, "completed");
      setSession((s) => (s ? { ...s, status: "completed" } : s));
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to complete session";
      setError(msg);
    }
  };

  const riskCounts = (risk: string) =>
    session?.findings.filter((f) => f.risk_rank === risk).length || 0;
  const riskOrder = ["critical", "high", "medium", "low", "info"];

  if (loading && !session) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error && !session) {
    return <ErrorState message={error} onRetry={loadSession} />;
  }

  // No session — prompt to start one
  if (!session || (!session.session_id && !loading)) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Link
            href={`/targets/${targetId}`}
            className="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-xl font-bold text-slate-200 flex items-center gap-3">
            <Bug size={20} className="text-purple-500" />
            Testing Workspace
          </h1>
        </div>

        <EmptyState
          title="No testing session"
          description="Start a testing session to begin working through threat model findings."
          action={
            <Button
              variant="primary"
              size="md"
              onClick={handleStartSession}
              loading={starting}
              icon={<Play size={14} />}
            >
              Start Testing Session
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/targets/${targetId}`}
          className="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-bold text-slate-200 flex items-center gap-3">
          <Bug size={20} className="text-purple-500" />
          Testing Workspace
        </h1>
        <Badge variant={session.status === "active" ? "success" : "default"}>
          {session.status}
        </Badge>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-2 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* 3-panel layout */}
      <div className="grid grid-cols-12 gap-4" style={{ minHeight: "calc(100vh - 200px)" }}>
        {/* Left Panel: Finding List */}
        <div className="col-span-3 overflow-y-auto space-y-1">
          {riskOrder.map((risk) => {
            const count = riskCounts(risk);
            if (count === 0) return null;
            return (
              <div key={risk}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 px-3 py-2">
                  {risk} ({count})
                </div>
                {session.findings
                  .filter((f) => f.risk_rank === risk)
                  .map((f) => (
                    <button
                      key={f.index}
                      onClick={() => setSelectedFinding(f)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all text-xs
                        ${
                          selectedFinding?.index === f.index
                            ? "bg-purple-600/10 border border-purple-500/30"
                            : "hover:bg-white/[0.03] border border-transparent"
                        }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0">
                          {STATUS_ICONS[f.status] || STATUS_ICONS.untested}
                        </span>
                        <div className="min-w-0">
                          <span className="text-slate-300 block truncate">
                            {f.finding_type}
                          </span>
                          {f.affected_endpoints?.[0] && (
                            <span className="text-[10px] text-slate-600 font-mono block truncate">
                              {f.affected_endpoints[0].method}{" "}
                              {f.affected_endpoints[0].path}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            );
          })}
          {hasMore && (
            <div className="px-3 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadSession(true)}
                loading={loadingMore}
              >
                Load more ({session.findings.length}/{session.total_findings})
              </Button>
            </div>
          )}
        </div>

        {/* Center Panel: Finding Details */}
        <div className="col-span-6">
          {selectedFinding ? (
            <Card>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-200">
                      {selectedFinding.finding_type}
                    </h2>
                    <Badge
                      variant={
                        selectedFinding.risk_rank === "critical"
                          ? "danger"
                          : selectedFinding.risk_rank === "high"
                            ? "danger"
                            : selectedFinding.risk_rank === "medium"
                              ? "warning"
                              : "default"
                      }
                    >
                      {selectedFinding.risk_rank}
                    </Badge>
                  </div>
                </div>

                {selectedFinding.affected_endpoints?.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Affected Endpoints
                    </h3>
                    <div className="space-y-1">
                      {selectedFinding.affected_endpoints.map((ep, i) => (
                        <div
                          key={i}
                          className="text-xs font-mono text-slate-400 bg-slate-800/50 rounded px-3 py-1.5"
                        >
                          <span className="text-purple-400">{ep.method}</span> {ep.path}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedFinding.exploitation_description && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Description
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {selectedFinding.exploitation_description}
                    </p>
                  </div>
                )}

                {(selectedFinding.exploitation_chain?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Exploitation Chain
                    </h3>
                    <ol className="list-decimal list-inside space-y-1">
                      {selectedFinding.exploitation_chain?.map((step, i) => (
                        <li key={i} className="text-xs text-slate-400">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <ExploitationSteps targetId={targetId} finding={selectedFinding} />

                <TestResultForm
                  targetId={targetId}
                  finding={selectedFinding}
                  onSubmit={handleSubmitResult}
                />

                {(selectedFinding.data_at_risk?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Data at Risk
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {selectedFinding.data_at_risk?.map((d, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded bg-rose-500/10 text-[10px] text-rose-400 border border-rose-500/20"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <EmptyState title="Select a finding" description="Choose a finding from the list to view details" />
          )}
        </div>

        {/* Right Panel: Session Stats */}
        <div className="col-span-3">
          <TestingStats
            session={session}
            onPause={handlePause}
            onComplete={handleComplete}
          />
        </div>
      </div>
    </div>
  );
}
