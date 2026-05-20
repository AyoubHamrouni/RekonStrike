"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { TestingFinding, TestResultSubmit, TestResultResponse } from "@/types";

interface TestResultFormProps {
  targetId: number;
  finding: TestingFinding;
  onSubmit: (result: TestResultResponse) => void;
}

export function TestResultForm({ targetId, finding, onSubmit }: TestResultFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    endpoint: finding.affected_endpoints?.[0]
      ? `${finding.affected_endpoints[0].method} ${finding.affected_endpoints[0].path}`
      : "",
    payload: "",
    response_status: 200,
    response_body: "",
    confirmed: null as boolean | null,
    notes: "",
  });

  const handleSubmit = async () => {
    if (form.confirmed === null) return;
    setSubmitting(true);
    try {
      const body: TestResultSubmit = {
        finding_id: finding.index,
        endpoint: form.endpoint,
        payload: form.payload,
        response_status: form.response_status,
        response_body: form.response_body || undefined,
        confirmed: form.confirmed,
        notes: form.notes || undefined,
      };
      const res = await fetch(`/api/targets/${targetId}/testing/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: TestResultResponse = await res.json();
      onSubmit(result);
      setExpanded(false);
    } catch {
      // error handling
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Cancel" : "Test Finding"}
      </Button>

      {expanded && (
        <div className="mt-3 space-y-3 bg-slate-900/60 border border-white/5 rounded-lg p-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Endpoint
            </label>
            <input
              type="text"
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              className="w-full bg-slate-800 border border-white/5 rounded px-3 py-2 text-sm text-slate-200 font-mono"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Payload
            </label>
            <textarea
              placeholder="Test payload..."
              value={form.payload}
              onChange={(e) => setForm({ ...form, payload: e.target.value })}
              rows={2}
              className="w-full bg-slate-800 border border-white/5 rounded px-3 py-2 text-sm text-slate-200 font-mono"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Response Status
              </label>
              <input
                type="number"
                value={form.response_status}
                onChange={(e) =>
                  setForm({ ...form, response_status: parseInt(e.target.value) || 0 })
                }
                className="w-full bg-slate-800 border border-white/5 rounded px-3 py-2 text-sm text-slate-200 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Response Body (optional)
            </label>
            <textarea
              placeholder="Response body (first 5KB)..."
              value={form.response_body}
              onChange={(e) => setForm({ ...form, response_body: e.target.value })}
              rows={3}
              className="w-full bg-slate-800 border border-white/5 rounded px-3 py-2 text-sm text-slate-200 font-mono"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Confirmed?
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="confirmed"
                  checked={form.confirmed === true}
                  onChange={() => setForm({ ...form, confirmed: true })}
                  className="text-emerald-500"
                />
                <span className="text-sm text-slate-300">Confirmed</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="confirmed"
                  checked={form.confirmed === false}
                  onChange={() => setForm({ ...form, confirmed: false })}
                  className="text-rose-500"
                />
                <span className="text-sm text-slate-300">Dismissed</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="confirmed"
                  checked={form.confirmed === null}
                  onChange={() => setForm({ ...form, confirmed: null })}
                />
                <span className="text-sm text-slate-500">Unclear</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Notes
            </label>
            <textarea
              placeholder="Notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full bg-slate-800 border border-white/5 rounded px-3 py-2 text-sm text-slate-200"
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            loading={submitting}
            disabled={form.confirmed === null || submitting}
          >
            Submit Test
          </Button>
        </div>
      )}
    </div>
  );
}
