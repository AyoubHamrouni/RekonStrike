import { Link } from "react-router-dom";
import { CheckCircle, AlertTriangle, XCircle, Play, ArrowRight } from "lucide-react";
import type { AgentStatus } from "../../types";

interface CompletionBannerProps {
  status: AgentStatus;
  guidance: string[];
  onReset: () => void;
}

export default function CompletionBanner({
  status,
  guidance,
  onReset,
}: CompletionBannerProps) {
  const isCompleted = status === "completed";
  const isInterrupted = status === "interrupted";

  return (
    <div
      className={`rounded-xl p-6 text-center animate-slide-up ${
        isCompleted
          ? "bg-green/5 border border-green/20"
          : isInterrupted
            ? "bg-yellow/5 border border-yellow/20"
            : "bg-red/5 border border-red/20"
      }`}
    >
      <div className="mb-3">
        {isCompleted ? (
          <CheckCircle size={40} className="text-green mx-auto" />
        ) : isInterrupted ? (
          <AlertTriangle size={40} className="text-yellow mx-auto" />
        ) : (
          <XCircle size={40} className="text-red mx-auto" />
        )}
      </div>
      <h2 className="text-lg font-bold text-text mb-1">
        {isCompleted
          ? "Reconnaissance Complete"
          : isInterrupted
            ? "Session Interrupted"
            : "Session Error"}
      </h2>
      {guidance.length > 0 && (
        <p className="text-sm text-text-dim mb-4 max-w-lg mx-auto">
          {guidance[guidance.length - 1]}
        </p>
      )}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Play size={16} />
          New Session
        </button>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-2 hover:bg-border text-text rounded-lg text-sm font-medium transition-colors"
        >
          <ArrowRight size={16} />
          Dashboard
        </Link>
      </div>
    </div>
  );
}
