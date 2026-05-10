import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { PhaseStep } from "../../types";

interface PhaseStepperProps {
  steps: PhaseStep[];
  currentDescription?: string | null;
}

function StepCircle({ step }: { step: PhaseStep }) {
  const base =
    "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300";

  if (step.status === "completed") {
    return (
      <div className={`${base} bg-green text-white`}>
        <CheckCircle size={18} />
      </div>
    );
  }

  if (step.status === "failed") {
    return (
      <div className={`${base} bg-red text-white`}>
        <XCircle size={18} />
      </div>
    );
  }

  if (step.status === "running") {
    return (
      <div
        className={`${base} bg-accent text-white shadow-[0_0_16px_rgba(124,58,237,0.3)]`}
      >
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  // pending
  return (
    <div className={`${base} bg-surface-2 text-text-dim border border-white/5`}>
      <span className="text-xs font-semibold">
        {steps.indexOf(step) + 1}
      </span>
    </div>
  );
}

const statusColors: Record<string, string> = {
  completed: "text-green",
  failed: "text-red",
  running: "text-accent",
  pending: "text-text-dim",
};

export default function PhaseStepper({ steps, currentDescription }: PhaseStepperProps) {
  if (steps.length === 0) return null;

  return (
    <div className="bg-surface border border-white/5 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-text mb-5 flex items-center gap-2">
        Phase Pipeline
      </h3>

      <div className="flex items-start gap-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-2">
                <StepCircle step={step} />
                <span
                  className={`text-[11px] font-medium text-center leading-tight ${statusColors[step.status]}`}
                >
                  {step.label}
                </span>
                <span className="text-[10px] text-text-dim/50 text-center leading-tight">
                  {step.status === "completed" && "Complete"}
                  {step.status === "failed" && "Failed"}
                  {step.status === "running" && "Running"}
                  {step.status === "pending" && "Pending"}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`flex-1 h-px mx-3 mt-5 ${
                    step.status === "completed"
                      ? "bg-green/50"
                      : step.status === "running"
                        ? "bg-accent/30"
                        : "bg-white/5"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {currentDescription && (
        <div className="mt-4 p-3 rounded-lg bg-accent-subtle/30 border border-accent/20 flex items-start gap-2 animate-fade-in">
          <div>
            <p className="text-[11px] text-text-dim/70 leading-relaxed">
              {currentDescription}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
