import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "react-hot-toast";
import { createTarget, startAgentSession, connectAgentSSE, fetchLiveHosts, fetchVulnerabilities } from "../api";
import type { LiveHost, Vulnerability } from "../types";

export interface GuidanceEntry {
  text: string;
  node: "strategy" | "triager";
  time: string;
}

export type AgentStatus = "idle" | "creating_target" | "starting" | "running" | "completed" | "error";

export interface AgentState {
  status: AgentStatus;
  targetId: number | null;
  targetDomain: string;
  sessionId: string | null;
  guidance: GuidanceEntry[];
  phasesCompleted: string[];
  currentPhase: string | null;
  liveHosts: LiveHost[];
  vulnerabilities: Vulnerability[];
  subdomainCount: number;
  liveHostCount: number;
  findingCount: number;
  strategy: Record<string, unknown> | null;
  error: string | null;
}

export function useAgent() {
  const [state, setState] = useState<AgentState>({
    status: "idle",
    targetId: null,
    targetDomain: "",
    sessionId: null,
    guidance: [],
    phasesCompleted: [],
    currentPhase: null,
    liveHosts: [],
    vulnerabilities: [],
    subdomainCount: 0,
    liveHostCount: 0,
    findingCount: 0,
    strategy: null,
    error: null,
  });
  const eventSourceRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      eventSourceRef.current?.close();
    };
  }, []);

  const addGuidance = useCallback((text: string, node: "strategy" | "triager") => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setState((prev) => ({
      ...prev,
      guidance: [...prev.guidance, { text, node, time }],
    }));
  }, []);

  const dispatchAgent = useCallback(async (domain: string) => {
    setState((prev) => ({
      ...prev,
      status: "creating_target",
      targetDomain: domain,
      guidance: [],
      phasesCompleted: [],
      currentPhase: null,
      liveHosts: [],
      vulnerabilities: [],
      subdomainCount: 0,
      liveHostCount: 0,
      findingCount: 0,
      strategy: null,
      error: null,
      sessionId: null,
    }));

    try {
      const target = await createTarget(domain, "wildcard");
      if (!mountedRef.current) return;

      setState((prev) => ({ ...prev, targetId: target.id, status: "starting" }));

      const session = await startAgentSession(target.id, {
        goal: `Reconnaissance on ${domain}`,
      });
      if (!mountedRef.current) return;

      const sessionId = session.session_id;
      setState((prev) => ({ ...prev, sessionId, status: "running" }));

      addGuidance(`Agent dispatched to ${domain}`, "strategy");

      const onEvent = (event: string, data: Record<string, unknown>) => {
        if (!mountedRef.current) return;

        switch (event) {
          case "guidance":
            addGuidance(
              (data.text as string) || "",
              (data.node as "strategy" | "triager") || "triager"
            );
            break;
          case "strategy":
            setState((prev) => ({ ...prev, strategy: data }));
            break;
          case "phase":
            setState((prev) => {
              const name = data.name as string;
              const already = prev.phasesCompleted.includes(name);
              return {
                ...prev,
                currentPhase: name,
                phasesCompleted: already ? prev.phasesCompleted : [...prev.phasesCompleted, name],
              };
            });
            break;
          case "state":
            setState((prev) => ({
              ...prev,
              subdomainCount: (data.subdomains_count as number) || prev.subdomainCount,
              liveHostCount: (data.live_hosts_count as number) || prev.liveHostCount,
              findingCount: (data.findings_count as number) || prev.findingCount,
            }));
            break;
          case "complete":
            setState((prev) => ({ ...prev, status: "completed" }));
            toast.success("Agent recon complete");
            break;
          case "interrupt":
            toast("Agent interrupted — awaiting input", { icon: "⏸" });
            break;
          case "heartbeat":
            break;
          default:
            break;
        }
      };

      const onError = () => {
        if (!mountedRef.current) return;
        toast.error("Agent stream disconnected");
        setState((prev) => ({ ...prev, status: "error", error: "SSE connection lost" }));
      };

      const source = connectAgentSSE(target.id, sessionId, onEvent, onError);
      eventSourceRef.current = source;

      setTimeout(async () => {
        if (!mountedRef.current) return;
        try {
          const hosts = await fetchLiveHosts(target.id);
          const vulns = await fetchVulnerabilities(target.id);
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              liveHosts: hosts.items || [],
              vulnerabilities: vulns.items || [],
              liveHostCount: hosts.total || hosts.items?.length || 0,
              findingCount: vulns.total || vulns.items?.length || 0,
            }));
          }
        } catch {
          // results may not be ready yet
        }
      }, 3000);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Agent dispatch failed: ${msg}`);
      setState((prev) => ({ ...prev, status: "error", error: msg }));
    }
  }, [addGuidance, state.status]);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setState({
      status: "idle",
      targetId: null,
      targetDomain: "",
      sessionId: null,
      guidance: [],
      phasesCompleted: [],
      currentPhase: null,
      liveHosts: [],
      vulnerabilities: [],
      subdomainCount: 0,
      liveHostCount: 0,
      findingCount: 0,
      strategy: null,
      error: null,
    });
  }, []);

  return { state, dispatchAgent, reset };
}
