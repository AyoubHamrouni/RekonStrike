"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Crosshair, Globe, Server,
  CheckCircle, Loader2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { fetchPhases, startScan } from "@/lib/api";
import toast from "react-hot-toast";
import type { Phase } from "@/types";
import type { ComponentType } from "react";

interface TargetTypeConfig {
  value: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  desc: string;
}

const TARGET_TYPES: TargetTypeConfig[] = [
  { value: "domain", label: "Domain", icon: Globe, desc: "Discover subdomains, crawl endpoints, and scan for vulnerabilities across the entire domain scope." },
  { value: "ip", label: "IP Range", icon: Server, desc: "Scan IP ranges for open ports, services, and hosted web applications." },
];

const LEARN_PHASES: Record<number, string> = {
  0: "Validates the target and loads scope rules to ensure everything is configured correctly.",
  1: "Searches public sources (certificate logs, search engines, GitHub) to discover subdomains without touching the target's servers.",
  2: "Checks which subdomains actually resolve in DNS, what ports are open, and if any cloud assets exist.",
  3: "Makes HTTP requests to every live host to identify web servers, technologies, and SSL certificates.",
  4: "Crawls websites and fetches historical URLs to discover hidden endpoints, API routes, and JS files.",
  5: "Runs Nuclei vulnerability templates against all discovered services to find CVEs and misconfigurations.",
  6: "Calculates ROI scores and consolidates all findings into a prioritized report.",
};

export default function ScansPage() {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [targetType, setTargetType] = useState("domain");
  const [phases, setPhases] = useState<Phase[]>([]);
  const [selectedPhases, setSelectedPhases] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phasesLoading, setPhasesLoading] = useState(true);
  const [phasesError, setPhasesError] = useState<string | null>(null);

  useEffect(() => {
    setPhasesLoading(true);
    setPhasesError(null);
    fetchPhases()
      .then((data) => {
        setPhases(data);
        setSelectedPhases(new Set(data.map((p) => p.id)));
      })
      .catch((err: Error) => {
        setPhasesError(err.message || "Failed to load phases");
        toast.error("Failed to load phases");
      })
      .finally(() => setPhasesLoading(false));
  }, []);

  const validate = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!target.trim()) errs.target = "Target is required";
    if (targetType === "domain" && !/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(target.trim())) {
      errs.target = "Enter a valid domain (e.g., example.com)";
    }
    if (selectedPhases.size === 0) errs.phases = "Select at least one phase";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [target, targetType, selectedPhases]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await startScan({
        target: target.trim(),
        target_type: targetType,
        phases: Array.from(selectedPhases),
      });
      toast.success("Scan started");
      router.push(`/scans/${result.session_id}`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to start scan");
    } finally {
      setSubmitting(false);
    }
  }, [target, targetType, selectedPhases, validate, router]);

  const togglePhase = (phaseId: number) => {
    setSelectedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPhases.size === phases.length) {
      setSelectedPhases(new Set());
    } else {
      setSelectedPhases(new Set(phases.map((p) => p.id)));
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-slate-200">New Reconnaissance Scan</h1>
        <p className="text-sm text-slate-500 mt-1">Configure and launch a new security assessment</p>
      </div>

      <div className="bg-surface border border-white/5 rounded-xl p-5 space-y-5">
        <div>
          <label htmlFor="target-input" className="text-xs font-medium text-slate-400 mb-1.5 block">Target</label>
          <input
            id="target-input"
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={targetType === "domain" ? "example.com" : "192.168.1.0/24"}
            className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-600/40 transition-colors ${
              errors.target ? "border-rose-500" : "border-white/5"
            }`}
            aria-invalid={!!errors.target}
          />
          {errors.target && (
            <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
              <AlertTriangle size={11} /> {errors.target}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-slate-400 mb-2 block">Target Type</label>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Target type">
            {TARGET_TYPES.map(({ value, label, icon: Icon, desc }) => (
              <button
                key={value}
                onClick={() => setTargetType(value)}
                role="radio"
                aria-checked={targetType === value}
                className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${
                  targetType === value
                    ? "bg-purple-600/10 border-purple-600/30"
                    : "bg-slate-800 border-white/5 hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} className={targetType === value ? "text-purple-500" : "text-slate-500"} />
                  <span className={`text-sm font-medium ${targetType === value ? "text-purple-400" : "text-slate-200"}`}>{label}</span>
                  {targetType === value && <CheckCircle size={14} className="ml-auto text-purple-500" />}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface border border-white/5 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Phases</h2>
          {!phasesLoading && !phasesError && (
            <button
              onClick={toggleAll}
              className="text-xs text-purple-500 hover:text-purple-400 transition-colors cursor-pointer"
              type="button"
            >
              {selectedPhases.size === phases.length ? "Clear All" : "Select All"}
            </button>
          )}
        </div>

        {phasesLoading ? (
          <div className="space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="skeleton w-5 h-5 rounded shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="skeleton h-4 w-40 rounded" />
                  <div className="skeleton h-3 w-64 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : phasesError ? (
          <div className="flex flex-col items-center py-8 text-center">
            <AlertTriangle size={20} className="text-rose-400 mb-2" />
            <p className="text-sm text-slate-500 mb-3">Failed to load phases</p>
            <button
              onClick={() => {
                setPhasesLoading(true);
                setPhasesError(null);
                fetchPhases()
                  .then((data) => { setPhases(data); setSelectedPhases(new Set(data.map((p) => p.id))); })
                  .catch((err: Error) => setPhasesError(err.message))
                  .finally(() => setPhasesLoading(false));
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : phases.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No phases available</p>
        ) : (
          <>
            <div className="space-y-1" role="group" aria-label="Scan phases">
              {phases.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePhase(p.id)}
                  role="checkbox"
                  aria-checked={selectedPhases.has(p.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                    selectedPhases.has(p.id)
                      ? "bg-purple-600/10 border-purple-600/30"
                      : "bg-slate-800 border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      selectedPhases.has(p.id)
                        ? "bg-purple-600 text-white"
                        : "bg-slate-800 border border-white/5"
                    }`}>
                      {selectedPhases.has(p.id) && <CheckCircle size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200">
                        Phase {p.number || p.id}: {p.name}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {p.description || LEARN_PHASES[p.id] || ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {errors.phases && (
              <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.phases}
              </p>
            )}
          </>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || phasesLoading}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Starting Scan...
          </>
        ) : (
          <>
            <Crosshair size={16} />
            Start Scan
          </>
        )}
      </button>
    </div>
  );
}
