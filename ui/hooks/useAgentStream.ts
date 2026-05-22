"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendAgentFeedback } from "@/lib/api";
import type { AgentStatus, ConnectionState, AgentEvent } from "@/types";

const BACKOFFS = [1000, 2000, 4000, 8000, 16000, 30000];

type FeedbackAction = "interrupt" | "stop" | "continue";

export function useAgentStream(targetId: number | null, sessionId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<AgentStatus>("running");
  const [strategy, setStrategy] = useState<unknown | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [completedPhases, setCompletedPhases] = useState<string[]>([]);
  const [failedPhases, setFailedPhases] = useState<string[]>([]);
  const [guidance, setGuidance] = useState<
    Array<{ id: string; ts: string; text: string; node?: string }>
  >([]);
  const [lastState, setLastState] = useState<Record<string, unknown> | null>(null);
  const [completion, setCompletion] = useState<{
    status: string;
    error?: string;
  } | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [attempt, setAttempt] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const counterRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  const push = useCallback((type: string, payload: unknown) => {
    counterRef.current += 1;
    const ev: AgentEvent = {
      id: `${Date.now()}-${counterRef.current}`,
      type,
      ts: new Date().toISOString(),
      payload,
    };
    setEvents((prev) => {
      const next = [...prev, ev];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
    return ev;
  }, []);

  const handleEvent = useCallback(
    (type: string, payload: unknown) => {
      if (type === "heartbeat") return;
      push(type, payload);

      if (type === "strategy") setStrategy(payload);
      if (type === "phase") {
        const p = payload as Record<string, unknown>;
        const name = typeof payload === "string" ? payload : (p?.name as string);
        if (name) {
          setCompletedPhases((prev) =>
            currentPhase && currentPhase !== name && !prev.includes(currentPhase)
              ? [...prev, currentPhase]
              : prev,
          );
          setCurrentPhase(name);
        }
      }
      if (type === "state") setLastState(payload as Record<string, unknown>);
      if (type === "guidance") {
        const p = payload as Record<string, unknown>;
        const text =
          typeof payload === "string"
            ? payload
            : (p?.text as string) ?? (p?.message as string) ?? JSON.stringify(payload);
        const node = typeof payload === "object" ? (p?.node as string) : undefined;
        setGuidance((prev) =>
          [
            { id: `${Date.now()}-${Math.random()}`, ts: new Date().toISOString(), text, node },
            ...prev,
          ].slice(0, 100),
        );
      }
      if (type === "interrupt") {
        setStatus("interrupted");
        const p = payload as Record<string, unknown>;
        setCompletion({ status: "interrupted", error: p?.reason as string });
        closeConnection();
      }
      if (type === "complete") {
        const p = payload as Record<string, unknown>;
        const s = (p?.status as string) ?? "completed";
        if (s === "error") setStatus("error");
        else if (s === "interrupted") setStatus("interrupted");
        else setStatus("completed");
        setCompletion({ status: s, error: p?.error as string });
        closeConnection();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPhase, push],
  );

  const closeConnection = useCallback(() => {
    closedRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    esRef.current?.close();
    esRef.current = null;
    setConnectionState("closed");
  }, []);

  const connect = useCallback(() => {
    if (!targetId || !sessionId) return;
    if (closedRef.current) return;
    setConnectionState(attempt > 0 ? "reconnecting" : "connecting");
    const url = `/api/targets/${targetId}/agent/${sessionId}/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnectionState("open");
      setAttempt(0);
    };

    const types = [
      "session", "strategy", "phase", "state", "guidance",
      "feedback", "interrupt", "complete", "heartbeat", "error",
    ];
    for (const t of types) {
      es.addEventListener(t, (ev: MessageEvent) => {
        let data: unknown = ev.data;
        try {
          data = JSON.parse(ev.data);
        } catch {}
        handleEvent(t, data);
      });
    }
    es.onmessage = (ev) => {
      let data: unknown = ev.data;
      try {
        data = JSON.parse(ev.data);
      } catch {}
      handleEvent("guidance", data);
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (closedRef.current) return;
      const next = attempt + 1;
      const delay = BACKOFFS[Math.min(next - 1, BACKOFFS.length - 1)];
      setConnectionState("reconnecting");
      setAttempt(next);
      reconnectTimerRef.current = setTimeout(() => connect(), delay);
    };
  }, [targetId, sessionId, attempt, handleEvent]);

  useEffect(() => {
    if (!targetId || !sessionId) return;
    closedRef.current = false;
    setStatus("running");
    connect();
    return () => {
      closeConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, sessionId]);

  const sendFeedback = useCallback(
    async (action: FeedbackAction, message?: string) => {
      if (!targetId || !sessionId) return;
      try {
        await sendAgentFeedback(targetId, sessionId, { action, message });
        push("feedback", { action, message });
        if (action === "stop") {
          setStatus("interrupted");
          setCompletion({ status: "interrupted", error: "stopped by user" });
          closeConnection();
        }
      } catch (e) {
        push("error", { message: (e as Error).message });
      }
    },
    [targetId, sessionId, push, closeConnection],
  );

  const reconnect = useCallback(() => {
    closedRef.current = false;
    setAttempt(0);
    connect();
  }, [connect]);

  return {
    events,
    status,
    strategy,
    currentPhase,
    completedPhases,
    failedPhases,
    guidance,
    state: lastState,
    completion,
    connectionState,
    sendFeedback,
    reconnect,
  };
}
