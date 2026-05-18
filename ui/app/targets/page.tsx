"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Target as TargetIcon,
  Search,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Shared";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { fetchTargets, createTarget } from "@/lib/api";
import type { Target } from "@/types";
import toast from "react-hot-toast";

export default function TargetsPage() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTarget, setNewTarget] = useState("");
  const [newType, setNewType] = useState("wildcard");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchTargets()
      .then(setTargets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newTarget.trim()) return;
    try {
      const t = await createTarget(newTarget.trim(), newType);
      setTargets((prev) => [t, ...prev]);
      setNewTarget("");
      setShowNew(false);
      toast.success("Target created");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [newTarget, newType]);

  const filtered = search
    ? targets.filter(
        (t) =>
          t.target.toLowerCase().includes(search.toLowerCase()) ||
          t.target_type.toLowerCase().includes(search.toLowerCase())
      )
    : targets;

  if (error) {
    return (
      <EmptyState
        icon={<TargetIcon size={24} />}
        title="Failed to load targets"
        description={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200">Targets</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {targets.length} target{targets.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={14} />}
          onClick={() => setShowNew(!showNew)}
        >
          New Target
        </Button>
      </div>

      {showNew && (
        <div className="bg-surface border border-white/5 rounded-xl p-5 animate-slide-up space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="example.com"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full sm:w-auto h-full px-3 py-2 bg-slate-800 border border-white/5 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-purple-600/40 cursor-pointer"
              >
                <option value="wildcard">Wildcard</option>
                <option value="domain">Domain</option>
                <option value="ip">IP Range</option>
                <option value="cidr">CIDR</option>
              </select>
            </div>
            <Button variant="primary" size="md" onClick={handleCreate}>
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      {targets.length > 0 && (
        <div className="relative max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter targets..."
            className="w-full bg-slate-900/50 border border-white/5 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-600/40 transition-all"
          />
        </div>
      )}

      {/* Target list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 skeleton rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<TargetIcon size={24} />}
          title={search ? "No targets match your search" : "No targets yet"}
          description={
            search
              ? "Try a different search term"
              : "Create your first target to start reconnaissance"
          }
          action={
            !search ? (
              <Button
                variant="primary"
                size="md"
                icon={<Plus size={14} />}
                onClick={() => setShowNew(true)}
              >
                Create Target
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <Link key={t.id} href={`/targets/${t.id}`}>
              <div className="bg-surface border border-white/5 rounded-xl px-5 py-4 flex items-center justify-between hover:border-white/10 hover:bg-white/[0.02] transition-all group cursor-pointer">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center text-purple-400 shrink-0">
                    <TargetIcon size={18} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-slate-200 group-hover:text-purple-400 transition-colors truncate block">
                      {t.target}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="purple">{t.target_type}</Badge>
                      <span className="text-[10px] text-slate-600">
                        Created{" "}
                        {t.created_at
                          ? new Date(t.created_at).toLocaleDateString()
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <ArrowRight
                  size={16}
                  className="text-slate-600 group-hover:text-purple-400 transition-colors shrink-0"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
