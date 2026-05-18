"use client";

import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { PhaseStep } from "@/types";

interface PhaseStepperProps {
  steps: PhaseStep[];
  currentDescription?: string | null;
}

function StepDot({ step, index }: { step: PhaseStep; index: number }) {
  if (step.status === "completed") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-500 shadow-[0_0_12px_rgba(0,212,170,0.2)]">
        <CheckCircle size={16} className="text-white" />
      </div>
    );
  }

  if (step.status === "failed") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-red-500 shadow-[0_0_12px_rgba(220,38,38,0.2)]">
        <XCircle size={16} className="text-white" />
      </div>
    );
  }

  if (step.status === "running") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-purple-600 shadow-[0_0_16px_rgba(124,58,237,0.35)]">
        <Loader2 size={16} className="text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/5 bg-slate-800">
      <span className="text-xs font-semibold text-slate-400">{index + 1}</span>
    </div>
  );
}

export default function PhaseStepper({ steps, currentDescription }: PhaseStepperProps) {
  if (steps.length === 0) return null;

  return (
    <div className="border border-white/5 rounded-xl p-6 bg-surface">
      <h3 className="text-sm font-semibold mb-6 flex items-center gap-2 text-slate-200">
        Phase Pipeline
      </h3>

      <div className="flex items-start">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-2 min-w-0 px-1">
                <StepDot step={step} index={i} />
                <span
                  className={`text-[11px] font-medium text-center leading-tight truncate max-w-full ${
                    step.status === "completed"
                      ? "text-emerald-400"
                      : step.status === "failed"
                        ? "text-red-400"
                        : step.status === "running"
                          ? "text-purple-400"
                          : "text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
                <span
                  className={`text-[10px] text-center leading-tight ${
                    step.status === "running" ? "text-purple-500" : "text-slate-600"
                  }`}
                >
                  {step.status === "completed"
                    ? "Complete"
                    : step.status === "failed"
                      ? "Failed"
                      : step.status === "running"
                        ? "Running"
                        : "Pending"}
                </span>
              </div>
              {!isLast && (
                <div
                  className="flex-1 h-px mx-4 mb-8"
                  style={{
                    backgroundColor:
                      step.status === "completed"
                        ? "rgba(0,212,170,0.4)"
                        : step.status === "running"
                          ? "rgba(124,58,237,0.25)"
                          : "rgba(255,255,255,0.05)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {currentDescription && (
        <div className="mt-5 p-4 rounded-lg border border-purple-600/15 bg-purple-600/5 animate-fade-in">
          <p className="text-xs leading-relaxed text-slate-400">
            {currentDescription}
          </p>
        </div>
      )}
    </div>
  );
}
