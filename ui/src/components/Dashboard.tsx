import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import {
  Play,
  RotateCcw,
  Terminal,
  Activity,
  ShieldCheck,
  Globe,
  Search,
  AlertTriangle,
  Server,
  Target,
} from "lucide-react";
import { Card, Badge, IconButton } from "./ui/Shared";
import { useAgent, type GuidanceEntry } from "../hooks/useAgent";
import { fetchTargets } from "../api";
import type { Target as TargetType } from "../types";

const PHASES = [
  { key: "phase_0_validate", label: "Validate" },
  { key: "phase_1_passive", label: "Passive" },
  { key: "phase_3_httpprobe", label: "Probe" },
  { key: "phase_4_content", label: "Content" },
  { key: "phase_5_vulnscan", label: "Vuln" },
  { key: "phase_6_scoring", label: "ROI" },
];

export const Dashboard: React.FC = () => {
  const { state, dispatchAgent, reset } = useAgent();
  const [targetInput, setTargetInput] = useState("");
  const [existingTargets, setExistingTargets] = useState<TargetType[]>([]);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTargets()
      .then(setExistingTargets)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.guidance]);

  const handleDispatch = () => {
    const domain = targetInput.trim();
    if (!domain) {
      toast.error("Enter a target domain");
      return;
    }
    dispatchAgent(domain);
  };

  const handleReset = () => {
    reset();
    setTargetInput("");
    toast("Pipeline reset", { icon: "\uD83D\uDD04" });
  };

  const activePhaseIndex = (() => {
    if (state.phasesCompleted.length === 0 && !state.currentPhase) return -1;
    const last = state.currentPhase || state.phasesCompleted[state.phasesCompleted.length - 1];
    return PHASES.findIndex((p) => p.key === last);
  })();

  const getSeverity = (roi: number | undefined): "danger" | "warning" | "default" => {
    if (!roi) return "default";
    if (roi >= 8) return "danger";
    if (roi >= 5) return "warning";
    return "default";
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── Automation Control ── */}
      <div className="grid grid-cols-12 gap-6">
        <Card
          className="col-span-12 lg:col-span-8"
          title="Autonomous Pipeline Execution"
          action={
            <div className="flex gap-2 items-center">
              <IconButton
                icon={<RotateCcw size={14} />}
                onClick={handleReset}
              />
              <button
                onClick={handleDispatch}
                disabled={state.status === "running" || state.status === "starting" || state.status === "creating_target"}
                className={`flex items-center gap-2 px-4 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all ${
                  state.status === "running"
                    ? "bg-emerald-500/10 text-emerald-500 cursor-not-allowed border border-emerald-500/20"
                    : "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20"
                }`}
              >
                {state.status === "running" ? (
                  <Activity size={12} className="animate-pulse" />
                ) : (
                  <Play size={12} fill="currentColor" />
                )}
                {state.status === "running"
                  ? "Agent Active"
                  : state.status === "starting" || state.status === "creating_target"
                  ? "Starting..."
                  : "Dispatch Agent"}
              </button>
            </div>
          }
        >
          {/* Target selector */}
          <div className="relative mb-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                <input
                  type="text"
                  value={targetInput}
                  onChange={(e) => {
                    setTargetInput(e.target.value);
                    setShowTargetDropdown(true);
                  }}
                  onFocus={() => setShowTargetDropdown(true)}
                  onBlur={() => setTimeout(() => setShowTargetDropdown(false), 200)}
                  placeholder="example.com"
                  className="w-full bg-slate-950/60 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-purple-600/50 font-mono"
                  disabled={state.status === "running"}
                />
              </div>
            </div>
            {showTargetDropdown && existingTargets.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-slate-900 border border-white/10 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                {existingTargets.map((t) => (
                  <button
                    key={t.id}
                    className="w-full text-left px-4 py-2 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200 font-mono transition-colors"
                    onMouseDown={() => {
                      setTargetInput(t.target);
                      setShowTargetDropdown(false);
                    }}
                  >
                    {t.target}
                  </button>
                ))}
              </div>
            )}
          </div>

          {state.targetDomain && (
            <div className="flex items-center gap-2 mb-3 px-1">
              <Target size={12} className="text-purple-500" />
              <span className="text-[10px] font-mono text-purple-400">
                Target: {state.targetDomain}
              </span>
              {state.status === "completed" && (
                <Badge variant="default">Complete</Badge>
              )}
              {state.status === "error" && (
                <Badge variant="danger">Error</Badge>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 py-4">
            {PHASES.map((phase, i) => (
              <React.Fragment key={phase.key}>
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center mb-2 transition-all duration-500 relative ${
                      state.phasesCompleted.includes(phase.key)
                        ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-600/30"
                        : state.currentPhase === phase.key
                        ? "border-purple-600 text-purple-400 animate-pulse"
                        : "border-slate-800 text-slate-700"
                    }`}
                  >
                    {state.phasesCompleted.includes(phase.key) ? (
                      <ShieldCheck size={20} />
                    ) : (
                      <span className="text-sm font-bold">{i}</span>
                    )}
                    {state.currentPhase === phase.key && state.status === "running" && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-600 rounded-full animate-ping" />
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest ${
                      state.currentPhase === phase.key
                        ? "text-purple-400"
                        : "text-slate-600"
                    }`}
                  >
                    {phase.label}
                  </span>
                </div>
                {i < PHASES.length - 1 && (
                  <div
                    className={`h-[1px] w-full max-w-[30px] mt-6 transition-colors duration-500 ${
                      state.phasesCompleted.includes(phase.key)
                        ? "bg-purple-600/50"
                        : "bg-slate-800"
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </Card>

        <div className="col-span-12 lg:col-span-4 grid grid-cols-2 gap-4">
          {[
            {
              label: "Subdomains",
              val: state.status === "idle" ? "—" : String(state.subdomainCount),
              color: "text-white",
              icon: Globe,
            },
            {
              label: "Live Hosts",
              val: state.status === "idle" ? "—" : String(state.liveHostCount),
              color: "text-white",
              icon: Server,
            },
            {
              label: "Findings",
              val: state.status === "idle" ? "—" : String(state.findingCount),
              color: state.findingCount > 0 ? "text-rose-500" : "text-white",
              icon: AlertTriangle,
            },
            {
              label: "Agent Status",
              val: state.status === "running" ? "Active" : state.status === "completed" ? "Done" : "Idle",
              color: state.status === "running" ? "text-emerald-400" : state.status === "completed" ? "text-purple-400" : "text-slate-500",
              border: "border-l-2 border-l-purple-600",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`bg-slate-900/50 border border-white/5 rounded-xl p-5 flex flex-col justify-between hover:bg-slate-900 transition-colors ${stat.border || ""}`}
            >
              <div className="flex items-center gap-2 mb-2">
                {stat.icon && <stat.icon size={12} className="text-slate-600" />}
                <span className="text-[9px] uppercase text-slate-600 font-black tracking-widest">
                  {stat.label}
                </span>
              </div>
              <span className={`text-2xl font-black ${stat.color}`}>{stat.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Data Center ── */}
      <div className="grid grid-cols-12 gap-6 items-stretch">
        {/* Asset Inventory */}
        <Card className="col-span-12 xl:col-span-8" title="High ROI Surface Discovery">
          {state.liveHosts.length > 0 ? (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-left text-[11px] border-t border-white/5">
                <thead className="bg-slate-950/40 text-slate-600 uppercase font-black tracking-widest text-[9px]">
                  <tr>
                    <th className="px-5 py-4">Endpoint Identity</th>
                    <th className="px-5 py-4">Technology Stack</th>
                    <th className="px-5 py-4 text-center">Threat Status</th>
                    <th className="px-5 py-4 text-right">ROI Index</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {state.liveHosts.map((host) => (
                    <tr key={host.id} className="hover:bg-white/[0.03] transition-colors cursor-pointer group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              getSeverity(host.roi_score) === "danger"
                                ? "bg-rose-500 animate-pulse"
                                : getSeverity(host.roi_score) === "warning"
                                ? "bg-amber-500"
                                : "bg-slate-700"
                            }`}
                          />
                          <div className="flex flex-col">
                            <span className="text-slate-200 font-bold group-hover:text-purple-400 transition-colors">
                              {host.url}
                            </span>
                            {host.title && (
                              <span className="text-[10px] text-slate-600 font-medium">
                                {host.title}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {(host.technologies || []).length > 0 ? (
                            host.technologies!.map((t: string) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 bg-slate-800/80 rounded border border-white/5 text-[9px] text-slate-400"
                              >
                                {t}
                              </span>
                            ))
                          ) : (
                            <span className="text-[9px] text-slate-700">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Badge
                          variant={
                            getSeverity(host.roi_score) === "danger"
                              ? "danger"
                              : getSeverity(host.roi_score) === "warning"
                              ? "warning"
                              : "default"
                          }
                        >
                          {getSeverity(host.roi_score) === "danger"
                            ? "Critical"
                            : getSeverity(host.roi_score) === "warning"
                            ? "Suspicious"
                            : "Passive"}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-purple-400 font-black text-xs">
                        {host.roi_score ? host.roi_score.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-700 select-none">
              {state.status === "running" ? (
                <>
                  <Activity size={32} className="mb-4 animate-pulse text-purple-600/50" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                    Scanning in progress...
                  </span>
                </>
              ) : (
                <>
                  <Globe size={32} className="mb-4" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                    {state.targetDomain ? "No results yet" : "Dispatch agent to begin"}
                  </span>
                </>
              )}
            </div>
          )}
        </Card>

        {/* AI Guidance Log */}
        <Card className="col-span-12 xl:col-span-4 flex flex-col" title="Strategist Intelligence Stream">
          <div
            ref={scrollRef}
            className="flex-1 bg-black/40 terminal-panel p-5 overflow-y-auto space-y-3 min-h-[400px] scroll-smooth"
          >
            {state.guidance.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none">
                <Terminal size={48} className="mb-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                  Awaiting Agent Dispatch
                </span>
              </div>
            ) : (
              state.guidance.map((log, i) => (
                <div key={i} className="flex gap-3 text-[11px] leading-relaxed animate-slide-in">
                  <span className="text-slate-700 shrink-0 select-none">[{log.time}]</span>
                  <span
                    className={`shrink-0 font-black uppercase text-[9px] px-1 rounded-sm tracking-widest ${
                      log.node === "strategy"
                        ? "bg-purple-600 text-white"
                        : "bg-emerald-500/10 text-emerald-500"
                    }`}
                  >
                    {log.node}
                  </span>
                  <span className="text-slate-300 font-medium">{log.text}</span>
                </div>
              ))
            )}
            {state.status === "running" && (
              <div className="animate-pulse inline-block w-2 h-4 bg-purple-600 translate-y-1" />
            )}
          </div>
        </Card>
      </div>

      {/* ── Footprint Analytics ── */}
      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-12 lg:col-span-6" title="Infrastructure Proximity Mapping">
          <div className="h-48 flex items-center justify-center bg-slate-950/40 rounded-xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,var(--color-purple-600)_1px,transparent_1px)] bg-[size:20px_20px]" />
            <div className="flex flex-col items-center gap-4">
              <Globe className="text-purple-600/50" size={32} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                {state.liveHosts.length > 0
                  ? `${state.liveHostCount} hosts mapped`
                  : "Generating Graph Topology..."}
              </span>
            </div>
          </div>
        </Card>
        <Card className="col-span-12 lg:col-span-6" title="Vulnerability Severity Distribution">
          <div className="h-48 flex items-end justify-between px-4 pb-2 pt-8 relative">
            <div className="absolute top-4 left-4 flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-[9px] font-bold text-slate-500">Critical</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[9px] font-bold text-slate-500">Medium</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-700" />
                <span className="text-[9px] font-bold text-slate-500">Low</span>
              </div>
            </div>
            {state.vulnerabilities.length > 0 ? (
              state.vulnerabilities.slice(0, 12).map((v, i) => {
                const h =
                  v.severity === "critical" ? 90 : v.severity === "high" ? 75 : v.severity === "medium" ? 55 : v.severity === "low" ? 30 : 15;
                return (
                  <div
                    key={v.id || i}
                    className={`flex-1 rounded-t-md transition-all duration-500 group relative border-t-2 ${
                      v.severity === "critical" || v.severity === "high"
                        ? "bg-rose-500/10 border-rose-500 hover:bg-rose-500/20"
                        : v.severity === "medium"
                        ? "bg-amber-500/10 border-amber-500 hover:bg-amber-500/20"
                        : "bg-slate-800 border-slate-700 hover:bg-slate-700"
                    }`}
                    style={{ height: `${h}%`, margin: "0 2px" }}
                    title={v.name || v.severity}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-[8px] px-1.5 py-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/5 font-bold">
                      {v.severity}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                  {state.status === "running" ? "Analyzing..." : "No vulnerabilities yet"}
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
