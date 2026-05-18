"use client";

import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-slate-900/50 border border-white/5 flex items-center justify-center mb-6 text-slate-600">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-bold text-slate-400 mb-2">{title}</h3>
      {description && (
        <p className="text-xs text-slate-600 max-w-sm text-center mb-6">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
