import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { PhaseStep } from "../../types";

interface PhaseStepperProps {
  steps: PhaseStep[];
  currentDescription?: string | null;
}

function StepDot({ step, index }: { step: PhaseStep; index: number }) {
  if (step.status === "completed") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-green shadow-[0_0_12px_rgba(0,212,170,0.2)]">
        <CheckCircle size={16} className="text-white" />
      </div>
    );
  }

  if (step.status === "failed") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-red shadow-[0_0_12px_rgba(220,38,38,0.2)]">
        <XCircle size={16} className="text-white" />
      </div>
    );
  }

  if (step.status === "running") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-accent shadow-[0_0_16px_rgba(124,58,237,0.35)]">
        <Loader2 size={16} className="text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/5" style={{ backgroundColor: "var(--color-surface-2)" }}>
      <span className="text-xs font-semibold text-text-dim">{index + 1}</span>
    </div>
  );
}

const labelColors: Record<string, string> = {
  completed: "text-green",
  failed: "text-red",
  running: "text-accent",
  pending: "text-text-dim",
};

const statusLabel: Record<string, string> = {
  completed: "Complete",
  failed: "Failed",
  running: "Running",
  pending: "Pending",
};

export default function PhaseStepper({ steps, currentDescription }: PhaseStepperProps) {
  if (steps.length === 0) return null;

  return (
    <div className="border border-white/5 rounded-xl p-6" style={{ backgroundColor: "var(--color-surface)" }}>
      <h3 className="text-sm font-semibold mb-6 flex items-center gap-2" style={{ color: "var(--color-text)" }}>
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
                  className={`text-[11px] font-medium text-center leading-tight truncate max-w-full ${labelColors[step.status]}`}
                >
                  {step.label}
                </span>
                <span
                  className="text-[10px] text-center leading-tight"
                  style={{ color: step.status === "running" ? "var(--color-accent)" : "var(--color-text-faint)" }}
                >
                  {statusLabel[step.status]}
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
        <div
          className="mt-5 p-4 rounded-lg border animate-fade-in"
          style={{
            backgroundColor: "rgba(124,58,237,0.06)",
            borderColor: "rgba(124,58,237,0.15)",
          }}
        >
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
            {currentDescription}
          </p>
        </div>
      )}
    </div>
  );
}
