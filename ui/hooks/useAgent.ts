"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  startAgentSession,
  connectAgentSSE,
  sendAgentFeedback,
} from "@/lib/api";
import type { AgentGuidance, AgentStrategy, AgentStatus } from "@/types";

export interface AgentState {
  status: AgentStatus;
  targetId: number | null;
  sessionId: string | null;
  guidance: AgentGuidance[];
  strategy: AgentStrategy | null;
  currentPhase: string | null;
  counters: { subdomainCount: number; liveHostCount: number; findingCount: number };
  error: string | null;
}

export function useAgent() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    targetId: null,
    sessionId: null,
    guidance: [],
    strategy: null,
    currentPhase: null,
    counters: { subdomainCount: 0, liveHostCount: 0, findingCount: 0 },
    error: null,
  });
  const sseRef = useRef<EventSource | null>(null);

  const cleanup = useCallback(() => {
    sseRef.current?.close();
    sseRef.current = null;
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const start = useCallback(
    async (targetId: number, goal: string) => {
      cleanup();
      setState((prev) => ({
        ...prev,
        status: "running",
        targetId,
        guidance: [],
        strategy: null,
        currentPhase: null,
        counters: { subdomainCount: 0, liveHostCount: 0, findingCount: 0 },
        error: null,
      }));

      try {
        const { session_id } = await startAgentSession(targetId, { goal });
        setState((prev) => ({ ...prev, sessionId: session_id }));

        const sse = connectAgentSSE(
          targetId,
          session_id,
          (event, data) => {
            switch (event) {
              case "guidance":
                setState((prev) => ({
                  ...prev,
                  guidance: [
                    ...prev.guidance,
                    {
                      text: data.text as string,
                      node: data.node as "strategy" | "triager",
                      time: data.time as string,
                    },
                  ],
                }));
                break;
              case "strategy":
                setState((prev) => ({
                  ...prev,
                  strategy: data as unknown as AgentStrategy,
                }));
                break;
              case "phase":
                setState((prev) => ({
                  ...prev,
                  currentPhase: (data as { phase: string }).phase,
                }));
                break;
              case "state":
                {
                  const d = data as {
                    discovered_subdomains?: string[];
                    live_hosts?: unknown[];
                    findings?: unknown[];
                  };
                  setState((prev) => ({
                    ...prev,
                    counters: {
                      subdomainCount: d.discovered_subdomains?.length ?? prev.counters.subdomainCount,
                      liveHostCount: d.live_hosts?.length ?? prev.counters.liveHostCount,
                      findingCount: d.findings?.length ?? prev.counters.findingCount,
                    },
                  }));
                }
                break;
              case "complete":
                setState((prev) => ({ ...prev, status: "completed" }));
                break;
              case "interrupt":
                setState((prev) => ({ ...prev, status: "interrupted" }));
                break;
            }
          },
          () => {
            setState((prev) => ({
              ...prev,
              status: "error",
              error: "SSE connection lost",
            }));
          }
        );
        sseRef.current = sse;
      } catch (e) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: (e as Error).message,
        }));
      }
    },
    [cleanup]
  );

  const feedback = useCallback(
    async (action: "continue" | "stop", message?: string) => {
      if (!state.targetId || !state.sessionId) return;
      try {
        await sendAgentFeedback(state.targetId, state.sessionId, {
          action,
          message,
        });
      } catch {
        /* ignore */
      }
    },
    [state.targetId, state.sessionId]
  );

  return { state, start, feedback, cleanup };
}
