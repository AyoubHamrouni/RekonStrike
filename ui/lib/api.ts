import type {
  Target,
  Session,
  Subdomain,
  LiveHost,
  Vulnerability,
  Endpoint,
  Stats,
  Phase,
  PaginationParams,
  PaginatedResponse,
  AgentSessionRequest,
  AgentFeedbackRequest,
  ScanRequest,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "";
const CONFIGURED_PREFIX = process.env.NEXT_PUBLIC_API_PREFIX || "";

let resolvedPrefix: string | null = null;

function normalizePrefix(prefix: string) {
  const cleaned = prefix.trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `/${cleaned}` : "";
}

async function probeUrl(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveApiPrefix() {
  if (resolvedPrefix !== null) return resolvedPrefix;

  const candidates = Array.from(
    new Set([
      normalizePrefix(CONFIGURED_PREFIX),
      "",
      "/api",
      "/api/v1",
      "/v1",
    ])
  );

  for (const prefix of candidates) {
    const url = `${BASE}${prefix}/health`;
    if (await probeUrl(url)) {
      resolvedPrefix = prefix;
      return resolvedPrefix;
    }
  }

  resolvedPrefix = normalizePrefix(CONFIGURED_PREFIX);
  return resolvedPrefix;
}

function buildUrl(path: string, prefix: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${prefix}${cleanPath}`;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const prefix = await resolveApiPrefix();
  const r = await fetch(buildUrl(path, prefix), opts);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function fetchTargets(): Promise<Target[]> {
  return req<Target[]>("/targets");
}

export async function fetchTarget(targetId: number): Promise<Target> {
  return req<Target>(`/targets/${targetId}`);
}

export async function createTarget(
  target: string,
  targetType = "wildcard"
): Promise<Target> {
  return req<Target>("/targets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, target_type: targetType }),
  });
}

export async function fetchSubdomains(
  targetId: number,
  params: PaginationParams = {}
): Promise<PaginatedResponse<Subdomain>> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined) as [string, string][]
  ).toString();
  return req<PaginatedResponse<Subdomain>>(`/targets/${targetId}/subdomains${q ? `?${q}` : ""}`);
}

export async function fetchLiveHosts(
  targetId: number,
  params: PaginationParams = {}
): Promise<PaginatedResponse<LiveHost>> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined) as [string, string][]
  ).toString();
  return req<PaginatedResponse<LiveHost>>(`/targets/${targetId}/live-hosts${q ? `?${q}` : ""}`);
}

export async function fetchVulnerabilities(
  targetId: number,
  params: PaginationParams = {}
): Promise<PaginatedResponse<Vulnerability>> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined) as [string, string][]
  ).toString();
  return req<PaginatedResponse<Vulnerability>>(`/targets/${targetId}/vulnerabilities${q ? `?${q}` : ""}`);
}

export async function fetchEndpoints(
  targetId: number,
  params: PaginationParams = {}
): Promise<Endpoint[]> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined) as [string, string][]
  ).toString();
  return req<Endpoint[]>(`/targets/${targetId}/endpoints${q ? `?${q}` : ""}`);
}

export async function fetchStats(targetId: number): Promise<Stats> {
  return req<Stats>(`/targets/${targetId}/stats`);
}

export async function fetchProgramScope(
  targetId: number
): Promise<Record<string, unknown>> {
  return req(`/targets/${targetId}/program`);
}

export async function aiTriage(
  targetId: number,
  body: Record<string, unknown> = {}
): Promise<unknown> {
  return req(`/targets/${targetId}/ai/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiSurface(
  targetId: number,
  body: Record<string, unknown> = {}
): Promise<unknown> {
  return req(`/targets/${targetId}/ai/surface`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiFpFilter(
  targetId: number,
  body: Record<string, unknown> = {}
): Promise<unknown> {
  return req(`/targets/${targetId}/ai/fp-filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiReport(
  targetId: number,
  body: Record<string, unknown>
): Promise<unknown> {
  return req(`/targets/${targetId}/ai/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiScope(
  targetId: number,
  body: Record<string, unknown> = {}
): Promise<unknown> {
  return req(`/targets/${targetId}/ai/scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiAdvisor(
  targetId: number,
  body: Record<string, unknown>
): Promise<unknown> {
  return req(`/targets/${targetId}/ai/advisor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchPhases(): Promise<Phase[]> {
  return req<Phase[]>("/phases");
}

export async function startScan(body: ScanRequest): Promise<{ session_id: number }> {
  return req("/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchSessions(limit = 20): Promise<Session[]> {
  return req<Session[]>(`/sessions?limit=${limit}`);
}

export async function fetchSession(
  sessionId: number
): Promise<Session> {
  return req<Session>(`/sessions/${sessionId}`);
}

export async function fetchHealth(): Promise<{ status: string }> {
  return req("/health");
}

export async function fetchSecrets(
  targetId: number,
  params: PaginationParams = {}
): Promise<unknown[]> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined) as [string, string][]
  ).toString();
  return req(`/targets/${targetId}/secrets${q ? `?${q}` : ""}`);
}

export async function fetchTakeovers(
  targetId: number,
  params: PaginationParams = {}
): Promise<unknown[]> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined) as [string, string][]
  ).toString();
  return req(`/targets/${targetId}/takeovers${q ? `?${q}` : ""}`);
}

export function connectWs(
  sessionId: number,
  onEvent: (event: string, data: Record<string, unknown>) => void
): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = process.env.NEXT_PUBLIC_WS_HOST || window.location.host;
  const ws = new WebSocket(`${proto}//${host}/ws/scan/${sessionId}`);
  ws.onmessage = (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data);
      onEvent(msg.event, msg.data);
    } catch {
      /* ignore parse errors */
    }
  };
  ws.onclose = () => {};
  return ws;
}

export async function startAgentSession(
  targetId: number,
  body: AgentSessionRequest
): Promise<{ session_id: string }> {
  return req(`/targets/${targetId}/agent/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchAgentSessions(
  targetId: number
): Promise<{ id: number; status: string; created_at: string; updated_at?: string }[]> {
  return req(`/targets/${targetId}/agent/sessions`);
}

export async function fetchAgentState(
  targetId: number,
  sessionId: string
): Promise<Record<string, unknown>> {
  return req(`/targets/${targetId}/agent/${sessionId}/state`);
}

export async function sendAgentFeedback(
  targetId: number,
  sessionId: string,
  body: AgentFeedbackRequest
): Promise<Record<string, unknown>> {
  return req(`/targets/${targetId}/agent/${sessionId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function startTestingSession(
  targetId: number,
  threatModelId?: number
): Promise<{ session_id: number; threat_model: unknown; findings: unknown[]; status: string }> {
  return req(`/targets/${targetId}/testing/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threat_model_id: threatModelId }),
  });
}

export async function getTestingSession(
  targetId: number,
  page = 0,
  size = 50
): Promise<import("@/types").TestingSession> {
  return req(`/targets/${targetId}/testing/session?page=${page}&size=${size}`);
}

export async function submitTestResult(
  targetId: number,
  body: import("@/types").TestResultSubmit
): Promise<import("@/types").TestResultResponse> {
  return req(`/targets/${targetId}/testing/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateTestingSession(
  targetId: number,
  status: "paused" | "completed"
): Promise<{ session_id: number; status: string }> {
  return req(`/targets/${targetId}/testing/session`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function getTestingAdvice(
  targetId: number,
  findingId: number
): Promise<import("@/types").AdviceResponse> {
  return req(`/targets/${targetId}/testing/advice/${findingId}`);
}

export function connectAgentSSE(
  targetId: number,
  sessionId: string,
  onEvent: (event: string, data: Record<string, unknown>) => void,
  onError?: () => void
): EventSource {
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  const url = `${base}/targets/${targetId}/agent/${sessionId}/stream`;
  const source = new EventSource(url);

  const events = [
    "session", "guidance", "strategy", "phase",
    "state", "interrupt", "complete", "heartbeat", "feedback",
  ];
  events.forEach((evt) => {
    source.addEventListener(evt, (e: Event) => {
      try {
        onEvent(evt, JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore parse errors */
      }
    });
  });

  source.onerror = () => {
    onError?.();
    source.close();
  };

  return source;
}
