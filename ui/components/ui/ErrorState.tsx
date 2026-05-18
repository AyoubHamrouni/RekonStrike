"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-6 text-rose-400">
        <AlertTriangle size={24} />
      </div>
      {title && <h3 className="text-sm font-bold text-slate-400 mb-2">{title}</h3>}
      <p className="text-xs text-slate-500 max-w-sm text-center mb-6">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
