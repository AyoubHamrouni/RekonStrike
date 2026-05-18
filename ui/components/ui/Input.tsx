"use client";

import React, { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, hint, className = "", ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? `${props.id}-error` : undefined}
            className={`w-full bg-slate-900/50 border rounded-lg px-3 py-2 text-sm text-slate-200
              placeholder:text-slate-600 transition-all duration-150
              focus:outline-none focus:border-purple-600/40 focus:bg-slate-900/80
              ${error ? "border-rose-500/40" : "border-white/5 hover:border-white/10"}
              ${icon ? "pl-9" : ""}
              ${className}`}
            {...props}
          />
        </div>
        {error && <p id={`${props.id}-error`} className="text-[10px] text-rose-400 font-medium" role="alert">{error}</p>}
        {hint && !error && <p className="text-[10px] text-slate-600">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
