"use client";

import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-purple-600 text-white hover:bg-purple-500 active:bg-purple-700 shadow-lg shadow-purple-600/15 border border-purple-500/30",
  secondary:
    "bg-slate-900 text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-white/5 hover:border-white/10",
  ghost:
    "bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent",
  danger:
    "bg-rose-600/10 text-rose-400 hover:bg-rose-600/20 active:bg-rose-600/30 border border-rose-600/20",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider gap-1.5",
  md: "px-4 py-2 text-[11px] font-bold uppercase tracking-wider gap-2",
  lg: "px-6 py-2.5 text-[12px] font-bold uppercase tracking-wider gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer
        ${variantStyles[variant]} ${sizeStyles[size]}
        ${disabled || loading ? "opacity-40 pointer-events-none" : ""}
        ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
