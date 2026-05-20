"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Target, Globe, Server, Shield, Activity, Link2, Bug } from "lucide-react";
import { Card, Badge } from "@/components/ui/Shared";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchTarget, fetchStats, fetchSubdomains, fetchLiveHosts, fetchVulnerabilities, fetchEndpoints } from "@/lib/api";
import type { Target as TargetType, Stats, Subdomain, LiveHost, Vulnerability, Endpoint } from "@/types";

type TabId = "overview" | "subdomains" | "hosts" | "vulnerabilities" | "endpoints" | "testing";

export default function TargetDetailPage() {
  const params = useParams();
  const targetId = Number(params.id);
  const [target, setTarget] = useState<TargetType | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTarget(targetId), fetchStats(targetId)])
      .then(([t, s]) => {
        setTarget(t);
        setStats(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [targetId]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  if (!target) return null;

  const vulnCount =
    typeof stats?.vulnerabilities === "number"
      ? stats.vulnerabilities
      : typeof stats?.vulnerabilities === "object"
        ? Object.values(stats.vulnerabilities).reduce((a, b) => a + b, 0)
        : 0;

  const tabs = [
    { id: "overview" as TabId, label: "Overview" },
    { id: "subdomains" as TabId, label: "Subdomains", count: stats?.subdomains },
    { id: "hosts" as TabId, label: "Live Hosts", count: stats?.live_hosts },
    { id: "vulnerabilities" as TabId, label: "Vulnerabilities", count: vulnCount },
    { id: "endpoints" as TabId, label: "Endpoints", count: stats?.endpoints },
    { id: "testing" as TabId, label: "Testing", icon: <Bug size={14} /> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/targets"
          className="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-200 flex items-center gap-3">
            <Target size={20} className="text-purple-500" />
            {target.target}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {target.target_type} · Created{" "}
            {target.created_at
              ? new Date(target.created_at).toLocaleDateString()
              : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/agent`}>
            <Button variant="primary" size="sm" icon={<Activity size={12} />}>
              Run Agent
            </Button>
          </Link>
          <Link href={`/scans`}>
            <Button variant="secondary" size="sm" icon={<Link2 size={12} />}>
              New Scan
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <Globe size={20} className="mx-auto mb-2 text-purple-500" />
            <div className="text-2xl font-black text-slate-100">{stats.subdomains}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Subdomains</div>
          </Card>
          <Card className="text-center">
            <Server size={20} className="mx-auto mb-2 text-emerald-500" />
            <div className="text-2xl font-black text-slate-100">{stats.live_hosts}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Live Hosts</div>
          </Card>
          <Card className="text-center">
            <Shield size={20} className="mx-auto mb-2 text-rose-500" />
            <div className="text-2xl font-black text-slate-100">{vulnCount}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Vulnerabilities</div>
          </Card>
          <Card className="text-center">
            <Activity size={20} className="mx-auto mb-2 text-blue-500" />
            <div className="text-2xl font-black text-slate-100">{stats.endpoints}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Endpoints</div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

      {activeTab === "overview" && <OverviewTab targetId={targetId} />}
      {activeTab === "subdomains" && <SubdomainsTab targetId={targetId} />}
      {activeTab === "hosts" && <LiveHostsTab targetId={targetId} />}
      {activeTab === "vulnerabilities" && <VulnerabilitiesTab targetId={targetId} />}
      {activeTab === "endpoints" && <EndpointsTab targetId={targetId} />}
      {activeTab === "testing" && <TestingTab targetId={targetId} />}
    </div>
  );
}

function OverviewTab({ targetId }: { targetId: number }) {
  return (
    <div className="space-y-6">
      <Card title="Actions">
        <div className="flex gap-3">
          <Link href={`/agent`}>
            <Button variant="primary" size="sm" icon={<Activity size={14} />}>
              Run Agent
            </Button>
          </Link>
          <Link href={`/scans`}>
            <Button
              variant="secondary"
              size="sm"
              icon={<Link2 size={14} />}
            >
              New Scan
            </Button>
          </Link>
        </div>
      </Card>

      <Card title="Quick Stats">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Target type</span>
            <p className="text-slate-200 font-medium mt-0.5 capitalize">Domain</p>
          </div>
          <div>
            <span className="text-slate-500">AI analysis ready</span>
            <p className="text-slate-200 font-medium mt-0.5">
              <Link href="/findings" className="text-purple-400 hover:text-purple-300">
                View analysis
              </Link>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SubdomainsTab({ targetId }: { targetId: number }) {
  const [data, setData] = useState<Subdomain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubdomains(targetId, { limit: 100 })
      .then((r) => setData(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetId]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!data.length)
    return <EmptyState title="No subdomains discovered" />;

  return (
    <div className="space-y-1">
      {data.map((s) => (
        <div
          key={s.id}
          className="bg-surface border border-white/5 rounded-lg px-4 py-3 flex items-center justify-between hover:border-white/10 transition-all"
        >
          <div>
            <span className="text-sm font-mono text-slate-200">
              {s.subdomain}
            </span>
            {s.source && (
              <span className="text-[10px] text-slate-600 ml-3">
                via {s.source}
              </span>
            )}
          </div>
          <Badge variant={s.resolved ? "success" : "default"}>
            {s.resolved ? "Resolved" : "Unresolved"}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function LiveHostsTab({ targetId }: { targetId: number }) {
  const [data, setData] = useState<LiveHost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLiveHosts(targetId, { limit: 100 })
      .then((r) => setData(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetId]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!data.length) return <EmptyState title="No live hosts discovered" />;

  return (
    <div className="space-y-1">
      {data.map((h) => (
        <div
          key={h.id}
          className="bg-surface border border-white/5 rounded-lg px-4 py-3 flex items-center justify-between hover:border-white/10 transition-all"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                (h.status_code || 0) < 400 ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            <div className="min-w-0">
              <span className="text-sm font-mono text-slate-200 truncate block">
                {h.url}
              </span>
              {h.title && (
                <span className="text-xs text-slate-500 truncate block">
                  {h.title}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {h.technologies?.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400 border border-white/5"
              >
                {t}
              </span>
            ))}
            <Badge
              variant={
                h.roi_score && h.roi_score >= 5
                  ? "warning"
                  : h.roi_score && h.roi_score >= 8
                    ? "danger"
                    : "default"
              }
            >
              ROI {h.roi_score?.toFixed(1)}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function VulnerabilitiesTab({ targetId }: { targetId: number }) {
  const [data, setData] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVulnerabilities(targetId, { limit: 100 })
      .then((r) => setData(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetId]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!data.length) return <EmptyState title="No vulnerabilities found" />;

  const severityColor = (s: string) => {
    switch (s) {
      case "critical":
        return "danger";
      case "high":
        return "danger";
      case "medium":
        return "warning";
      case "low":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-1">
      {data.map((v) => (
        <div
          key={v.id}
          className="bg-surface border border-white/5 rounded-lg px-4 py-3 flex items-center justify-between hover:border-white/10 transition-all"
        >
          <div className="min-w-0">
            <span className="text-sm font-medium text-slate-200 truncate block">
              {v.name || v.template_id || "Unknown"}
            </span>
            {v.matched_at && (
              <span className="text-xs text-slate-500 font-mono">
                {v.matched_at}
              </span>
            )}
          </div>
          <Badge variant={severityColor(v.severity)}>{v.severity}</Badge>
        </div>
      ))}
    </div>
  );
}

function EndpointsTab({ targetId }: { targetId: number }) {
  const [data, setData] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEndpoints(targetId, { limit: 100 })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetId]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!data.length) return <EmptyState title="No endpoints discovered" />;

  return (
    <div className="space-y-1">
      {data.map((e) => (
        <div
          key={e.id || e.url}
          className="bg-surface border border-white/5 rounded-lg px-4 py-3 flex items-center justify-between hover:border-white/10 transition-all"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                (e.status_code || 0) < 400 ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <div className="min-w-0">
              <span className="text-sm font-mono text-slate-200 truncate block">
                {e.url}
              </span>
              {e.method && (
                <span className="text-[10px] text-slate-600">
                  {e.method} · {e.status_code} · {e.content_type}
                </span>
              )}
            </div>
          </div>
          {e.source && (
            <span className="text-[10px] text-slate-600 shrink-0">
              {e.source}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function TestingTab({ targetId }: { targetId: number }) {
  return (
    <Card>
      <div className="text-center py-8">
        <Bug size={32} className="mx-auto mb-3 text-purple-500" />
        <h3 className="text-lg font-bold text-slate-200 mb-2">
          Testing Workspace
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Work through threat model findings, submit test results, and track confirmed vulnerabilities.
        </p>
        <Link href={`/targets/${targetId}/testing`}>
          <Button variant="primary" size="md" icon={<Bug size={14} />}>
            Open Testing Workspace
          </Button>
        </Link>
      </div>
    </Card>
  );
}
