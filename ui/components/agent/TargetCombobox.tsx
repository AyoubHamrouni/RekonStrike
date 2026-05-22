"use client";

import { useEffect, useState, useRef } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { fetchTargets } from "@/lib/api";
import type { Target } from "@/types";
import { AddTargetModal } from "./AddTargetModal";

export function TargetCombobox({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTargets()
      .then(setTargets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selected = targets.find((t) => t.id === value) ?? null;

  useEffect(() => {
    if (!value && targets.length > 0) onChange(targets[0].id);
  }, [value, targets, onChange]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = targets.filter((t) =>
    t.target.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-11 w-full items-center justify-between rounded-md border border-border bg-bg px-3 text-sm text-white transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <span className={selected ? "text-white" : "text-dim"}>
          {selected ? selected.target : loading ? "Loading targets…" : "Select a target"}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-dim" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-2xl animate-fade-in">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-dim" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search targets…"
              className="w-full bg-transparent text-sm text-white placeholder:text-dim focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-dim">
                No targets match &ldquo;{query}&rdquo;
              </div>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white hover:bg-surface-2 transition-colors"
              >
                <div>
                  <div>{t.target}</div>
                  {t.target_type && (
                    <div className="text-[10px] uppercase tracking-wide text-dim">
                      {t.target_type}
                    </div>
                  )}
                </div>
                {t.id === value && <Check className="h-3.5 w-3.5 text-accent" />}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setShowAdd(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-accent hover:bg-accent/10 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add target
          </button>
        </div>
      )}

      <AddTargetModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(t) => {
          setTargets((prev) => [...prev, t]);
          onChange(t.id);
          setShowAdd(false);
        }}
      />
    </div>
  );
}
