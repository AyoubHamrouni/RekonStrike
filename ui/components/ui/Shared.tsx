"use client";

import React from "react";

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: "default" | "danger" | "warning" | "success" | "purple";
}> = ({ children, variant = "default" }) => {
  const styles = {
    default: "bg-slate-800 text-slate-400 border-white/5",
    danger: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    purple: "bg-purple-600/10 text-purple-400 border-purple-600/20",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${styles[variant]}`}
    >
      {children}
    </span>
  );
};

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}> = ({ children, className, title, action }) => (
  <div
    className={`bg-slate-900/40 border border-white/5 rounded-xl overflow-hidden flex flex-col group hover:border-white/10 transition-all ${className}`}
  >
    {title && (
      <div className="px-5 py-3 border-b border-white/5 bg-slate-950/40 flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">
          {title}
        </h3>
        {action}
      </div>
    )}
    <div className="flex-1 p-5">{children}</div>
  </div>
);

export const IconButton: React.FC<{
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}> = ({ icon, onClick, active }) => (
  <button
    onClick={onClick}
    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
      active
        ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
        : "bg-slate-900 border border-white/5 text-slate-500 hover:text-slate-200 hover:border-white/20"
    }`}
  >
    {icon}
  </button>
);

export interface TargetData {
  id: string;
  domain: string;
  org: string;
  severity: "high" | "medium" | "low";
  lastScan: string;
}

export interface AgentStep {
  phase: string;
  status: "pending" | "running" | "completed" | "error";
  progress: number;
}
