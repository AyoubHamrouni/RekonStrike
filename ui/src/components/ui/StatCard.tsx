import type { ComponentType } from "react";

interface StatCardProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value?: number | string | null;
  subtitle?: string;
  color?: string;
  loading?: boolean;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
  loading,
}: StatCardProps) {
  return (
    <div className="bg-surface border border-white/5 rounded-xl p-5 transition-all duration-200 hover:border-white/10">
      <div className={`p-2.5 rounded-lg mb-3 w-fit ${color || "bg-surface-2"}`}>
        <Icon size={18} className="text-text" />
      </div>
      {loading ? (
        <>
          <div className="skeleton h-8 w-20 mb-2" />
          <div className="skeleton h-3 w-32" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-text tracking-tight">
            {value ?? "—"}
          </div>
          <div className="text-xs text-text-dim mt-1">{label}</div>
          {subtitle && (
            <div className="text-xs text-text-dim/60 mt-0.5">{subtitle}</div>
          )}
        </>
      )}
    </div>
  );
}
