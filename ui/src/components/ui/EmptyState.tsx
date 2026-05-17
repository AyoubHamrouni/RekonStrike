import type { ComponentType, ReactNode } from "react";

interface EmptyStateProps {
  icon?: ComponentType<{ size?: number }>;
  title: string;
  message?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-white/5 flex items-center justify-center mb-4">
          <Icon size={24} className="text-text-dim/50" />
        </div>
      )}
      <h3 className="text-base font-semibold text-text mb-1.5">{title}</h3>
      {message && <p className="text-sm text-text-dim/70 max-w-md leading-relaxed mb-5">{message}</p>}
      {action}
    </div>
  );
}
