import type { ComponentType } from "react";

interface StatCardProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value?: number | string | null;
  subtitle?: string;
  color?: string;
  accentColor?: string;
  loading?: boolean;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
  accentColor,
  loading,
}: StatCardProps) {
  return (
    <div className="bg-surface border border-white/5 rounded-xl overflow-hidden transition-all duration-200 hover:border-white/10">
      <div
        className="h-0.5"
        style={{ background: accentColor || "var(--color-accent)" }}
      />
      <div className="p-5">
        {loading ? (
          <>
            <div className="skeleton w-9 h-9 rounded-lg mb-3" />
            <div className="skeleton h-8 w-24 mb-2" />
            <div className="skeleton h-3 w-32" />
          </>
        ) : (
          <>
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
                color || "bg-accent-subtle"
              }`}
            >
              <Icon size={18} className="text-text" />
            </div>
            <div className="text-2xl font-bold text-text tracking-tight leading-none">
              {value !== null && value !== undefined ? value : "—"}
            </div>
            <div className="text-xs text-text-dim mt-2">{label}</div>
            {subtitle && (
              <div className="text-[11px] text-text-dim/50 mt-0.5">
                {subtitle}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
