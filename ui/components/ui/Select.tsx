"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  label,
  error,
  options,
  placeholder,
  className = "",
  ...props
}: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          aria-invalid={error ? "true" : undefined}
          className={`w-full appearance-none bg-slate-900/50 border rounded-lg px-3 py-2 pr-9 text-sm text-slate-200
            transition-all duration-150 cursor-pointer
            focus:outline-none focus:border-purple-600/40 focus:bg-slate-900/80
            ${error ? "border-rose-500/40" : "border-white/5 hover:border-white/10"}
            ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
        />
      </div>
      {error && <p className="text-[10px] text-rose-400 font-medium" role="alert">{error}</p>}
    </div>
  );
}
