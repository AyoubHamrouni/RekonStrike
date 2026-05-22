"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Rocket } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { TargetCombobox } from "@/components/agent/TargetCombobox";
import { GoalSelect, resolveGoal, type GoalPresetValue } from "@/components/agent/GoalSelect";
import { SessionHistoryTable } from "@/components/agent/SessionHistoryTable";
import { fetchTargets, startAgentSession } from "@/lib/api";
import type { Target } from "@/types";

export default function AgentPage() {
  const router = useRouter();
  const [targetId, setTargetId] = useState<number | null>(null);
  const [preset, setPreset] = useState<GoalPresetValue>("subdomain_takeover");
  const [custom, setCustom] = useState("");
  const [launching, setLaunching] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    fetchTargets()
      .then(setTargets)
      .catch(() => {});
  }, []);

  const selectedTarget = useMemo(
    () => targets.find((t) => t.id === targetId) ?? null,
    [targets, targetId],
  );

  const resolvedGoal = useMemo(() => resolveGoal(preset, custom), [preset, custom]);
  const canLaunch = !!targetId && resolvedGoal.length > 0 && !launching;

  async function launch() {
    if (!targetId) return;
    setLaunching(true);
    try {
      const res = await startAgentSession(targetId, { goal: resolvedGoal });
      toast.success(`Agent session #${res.session_id} started`);
      router.push(`/agent/session/${res.session_id}?targetId=${targetId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader
        eyebrow="autonomous recon"
        title="AI Agent"
        description="The strategist plans, the executor runs phases, the triager interprets results. Pick a target and a goal — you can steer or interrupt at any time."
      />

      <div className="mx-auto max-w-3xl space-y-6">
        <div className="glass-panel rounded-xl p-6">
          <div className="mb-5 flex items-center gap-2">
            <div className="rounded-md bg-accent/10 p-2 ring-1 ring-accent/30">
              <Bot className="h-4 w-4 text-accent" />
            </div>
            <div>
              <div className="label-eyebrow">launch</div>
              <h2 className="text-base font-semibold text-white">Configure a run</h2>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="label-eyebrow mb-2 block">target</label>
              <TargetCombobox value={targetId} onChange={setTargetId} />
            </div>

            <div>
              <label className="label-eyebrow mb-2 block">goal</label>
              <GoalSelect
                preset={preset}
                custom={custom}
                onChange={(p, c) => {
                  setPreset(p);
                  setCustom(c);
                }}
              />
            </div>

            <button
              type="button"
              onClick={launch}
              disabled={!canLaunch}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-white shadow-glow transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {launching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Launching…
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" /> Launch Agent
                </>
              )}
            </button>
          </div>
        </div>

        <SessionHistoryTable targetId={targetId} targetName={selectedTarget?.target} />
      </div>
    </div>
  );
}
