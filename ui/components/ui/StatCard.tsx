"use client";

import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: "up" | "down";
  trendValue?: string;
}

export function StatCard({ label, value, icon, trend, trendValue }: StatCardProps) {
  return (
    <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-400 transition-colors">
          {label}
        </span>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-black text-slate-100">{value}</span>
        {trend && (
          <div
            className={`flex items-center gap-1 text-[10px] font-bold ${
              trend === "up" ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {trend === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trendValue}
          </div>
        )}
      </div>
    </div>
  );
}
