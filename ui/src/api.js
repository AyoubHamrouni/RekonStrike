const BASE = import.meta.env.VITE_API_URL || "";

async function req(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, opts);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function fetchTargets() {
  return req("/targets");
}

export async function fetchSubdomains(targetId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return req(`/targets/${targetId}/subdomains${q ? `?${q}` : ""}`);
}

export async function fetchLiveHosts(targetId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return req(`/targets/${targetId}/live-hosts${q ? `?${q}` : ""}`);
}

export async function fetchVulnerabilities(targetId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return req(`/targets/${targetId}/vulnerabilities${q ? `?${q}` : ""}`);
}

export async function fetchEndpoints(targetId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return req(`/targets/${targetId}/endpoints${q ? `?${q}` : ""}`);
}

export async function fetchStats(targetId) {
  return req(`/targets/${targetId}/stats`);
}

export async function fetchProgramScope(targetId) {
  return req(`/targets/${targetId}/program`);
}

export async function aiTriage(targetId, body = {}) {
  return req(`/targets/${targetId}/ai/triage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiSurface(targetId, body = {}) {
  return req(`/targets/${targetId}/ai/surface`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiFpFilter(targetId, body = {}) {
  return req(`/targets/${targetId}/ai/fp-filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiReport(targetId, body) {
  return req(`/targets/${targetId}/ai/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiScope(targetId, body = {}) {
  return req(`/targets/${targetId}/ai/scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function aiAdvisor(targetId, body) {
  return req(`/targets/${targetId}/ai/advisor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchPhases() {
  return req("/phases");
}

export async function startScan(target, targetType, phases) {
  return req("/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, target_type: targetType, phases }),
  });
}

export async function fetchSessions(limit = 20) {
  return req(`/sessions?limit=${limit}`);
}

export async function fetchSession(sessionId) {
  return req(`/sessions/${sessionId}`);
}

export async function fetchHealth() {
  return req("/health");
}

export async function fetchSecrets(targetId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return req(`/targets/${targetId}/secrets${q ? `?${q}` : ""}`);
}

export async function fetchTakeovers(targetId, params = {}) {
  const q = new URLSearchParams(params).toString();
  return req(`/targets/${targetId}/takeovers${q ? `?${q}` : ""}`);
}

export function connectWs(sessionId, onEvent) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = import.meta.env.VITE_WS_HOST || window.location.host;
  const ws = new WebSocket(`${proto}//${host}/ws/scan/${sessionId}`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      onEvent(msg.event, msg.data);
    } catch {}
  };
  ws.onclose = () => {};
  return ws;
}

// ── Agent API ──────────────────────────────────────────────────────────────

export async function startAgentSession(targetId, body = {}) {
  return req(`/targets/${targetId}/agent/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchAgentState(targetId, sessionId) {
  return req(`/targets/${targetId}/agent/${sessionId}/state`);
}

export async function sendAgentFeedback(targetId, sessionId, body = {}) {
  return req(`/targets/${targetId}/agent/${sessionId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function connectAgentSSE(targetId, sessionId, onEvent, onError) {
  const base = import.meta.env.VITE_API_URL || "";
  const url = `${base}/targets/${targetId}/agent/${sessionId}/stream`;
  const source = new EventSource(url);

  const events = ["session", "guidance", "strategy", "phase", "state", "interrupt", "complete", "heartbeat", "feedback"];
  events.forEach((evt) => {
    source.addEventListener(evt, (e) => {
      try {
        onEvent(evt, JSON.parse(e.data));
      } catch {}
    });
  });

  source.onerror = () => {
    onError?.();
    source.close();
  };

  return source;
}
