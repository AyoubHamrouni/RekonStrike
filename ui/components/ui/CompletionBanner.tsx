"use client";

import React from "react";
import { CheckCircle, RotateCcw, XCircle, PauseCircle } from "lucide-react";
import { Button } from "./Button";

interface CompletionBannerProps {
  status: string;
  guidance: string[];
  onReset: () => void;
}

export default function CompletionBanner({ status, guidance, onReset }: CompletionBannerProps) {
  const isError = status === "error";
  const isInterrupted = status === "interrupted";

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 rounded-xl border animate-slide-up ${
        isError
          ? "bg-rose-500/5 border-rose-500/15"
          : isInterrupted
            ? "bg-amber-500/5 border-amber-500/15"
            : "bg-emerald-500/5 border-emerald-500/15"
      }`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          isError
            ? "bg-rose-500/10 text-rose-400"
            : isInterrupted
              ? "bg-amber-500/10 text-amber-400"
              : "bg-emerald-500/10 text-emerald-400"
        }`}
      >
        {isError ? (
          <XCircle size={20} />
        ) : isInterrupted ? (
          <PauseCircle size={20} />
        ) : (
          <CheckCircle size={20} />
        )}
      </div>
      <div className="flex-1">
        <p
          className={`text-sm font-bold ${
            isError
              ? "text-rose-300"
              : isInterrupted
                ? "text-amber-300"
                : "text-emerald-300"
          }`}
        >
          {isError
            ? "Agent encountered an error"
            : isInterrupted
              ? "Agent interrupted"
              : "Agent reconnaissance complete"}
        </p>
        {guidance.length > 0 && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
            {guidance[guidance.length - 1]}
          </p>
        )}
        <Button
          variant="secondary"
          size="sm"
          icon={<RotateCcw size={12} />}
          onClick={onReset}
          className="mt-3"
        >
          Start New Session
        </Button>
      </div>
    </div>
  );
}
