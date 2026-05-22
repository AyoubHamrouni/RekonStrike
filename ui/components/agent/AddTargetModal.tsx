"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { createTarget } from "@/lib/api";
import type { Target } from "@/types";

export function AddTargetModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (target: Target) => void;
}) {
  const [domain, setDomain] = useState("");
  const [wildcard, setWildcard] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    setSubmitting(true);
    try {
      const t = await createTarget(domain.trim(), wildcard ? "wildcard" : "domain");
      toast.success(`Added ${t.target}`);
      onCreated(t);
      setDomain("");
      setWildcard(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add target" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label-eyebrow mb-1.5 block">domain</label>
          <input
            autoFocus
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-white placeholder:text-dim focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={wildcard}
            onChange={(e) => setWildcard(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Wildcard scope (*.{domain || "example.com"})
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm text-white hover:border-border-strong transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!domain.trim() || submitting}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add target
          </button>
        </div>
      </form>
    </Modal>
  );
}
