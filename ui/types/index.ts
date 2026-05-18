import type { ComponentType } from "react";

export interface Target {
  id: number;
  target: string;
  target_type: string;
  created_at?: string;
}

export type SessionStatus = "running" | "completed" | "failed" | "cancelled" | "idle";

export interface Session {
  id: number;
  status: SessionStatus;
  started_at?: string;
  current_phase?: string;
  stats?: Record<string, number>;
  workflow?: string;
  target_id?: number;
}

export interface Subdomain {
  id: number;
  subdomain: string;
  name?: string;
  source?: string;
  resolved?: boolean;
  created_at?: string;
}

export interface LiveHost {
  id: number;
  url: string;
  status_code?: number;
  title?: string;
  technologies?: string[];
  roi_score?: number;
  ip?: string;
  response_headers?: Record<string, string>;
}

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Vulnerability {
  id: number;
  name?: string;
  template_id?: string;
  severity: Severity;
  matched_at?: string;
  description?: string;
  confidence?: number;
}

export interface Endpoint {
  id: number;
  url: string;
  method?: string;
  status_code?: number;
  content_type?: string;
  source?: string;
}

export interface Stats {
  subdomains: number;
  resolved_subdomains?: number;
  live_hosts: number;
  vulnerabilities: number | Record<string, number>;
  endpoints: number;
  sessions?: number;
}

export interface Finding {
  _ts: number;
  title: string;
  url: string;
  severity: Severity;
  steps: string;
  impact: string;
  request: string;
  response: string;
  module: string;
  _aiEnhanced?: boolean;
}

export interface Phase {
  id: number;
  number: number;
  name: string;
  description?: string;
}

export interface AgentGuidance {
  text: string;
  node: "strategy" | "triager";
  time: string;
}

export interface AgentStrategy {
  focus_areas?: string[];
  priority_targets?: string[];
  depth_vs_breadth?: string;
  reasoning?: string;
}

export interface AgentCounters {
  subdomainCount: number;
  liveHostCount: number;
  findingCount: number;
}

export interface PhaseStatus {
  completed: Set<string>;
  failed: Set<string>;
}

export type AgentStatus = "idle" | "running" | "completed" | "interrupted" | "error";

export interface NavItem {
  path: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  end?: boolean;
}

export interface SeverityColorMap {
  critical: string;
  high: string;
  medium: string;
  low: string;
  info: string;
}

export type PhaseStepStatus = "completed" | "running" | "pending" | "failed";

export interface PhaseStep {
  key: string;
  label: string;
  description: string;
  status: PhaseStepStatus;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  size: number;
  items: T[];
}

export interface AgentSessionRequest {
  goal: string;
  max_steps?: number;
}

export interface AgentFeedbackRequest {
  action: "continue" | "stop";
  message?: string;
}

export interface ScanRequest {
  target: string;
  target_type: string;
  phases: number[];
}
