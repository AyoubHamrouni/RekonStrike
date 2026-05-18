"use client";

import React from "react";

interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-white/5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider
            transition-all duration-150 border-b-2 -mb-[1px] cursor-pointer
            ${
              active === tab.id
                ? "text-purple-400 border-purple-500"
                : "text-slate-500 border-transparent hover:text-slate-300 hover:border-slate-700"
            }`}
        >
          {tab.icon && <span className="shrink-0">{tab.icon}</span>}
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold
              ${
                active === tab.id
                  ? "bg-purple-600/20 text-purple-400"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
