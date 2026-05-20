export interface CaptureRequest {
  target_url: string;
  scope?: string[];
  auth_config?: Record<string, unknown>;
  max_steps?: number;
  capture_screenshot?: boolean;
  wait_for?: string;
}

export interface NetworkLog {
  url: string;
  method: string;
  status: number;
  request_headers: Record<string, string>;
  response_headers: Record<string, string>;
  body_preview?: string;
  timestamp: string;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

export interface StorageData {
  origin: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface JsError {
  message: string;
  source: string;
  lineno: number;
  colno: number;
  stack?: string;
}

export interface JsBundle {
  url: string;
  content: string;
}

export interface SourceMap {
  url: string;
  source_map_url: string;
}

export interface CaptureResponse {
  rendered_html: string;
  network_logs: NetworkLog[];
  cookies_set: CookieData[];
  local_storage: StorageData[];
  session_storage: StorageData[];
  javascript_errors: JsError[];
  execution_time_ms: number;
  screenshot_base64?: string;
  js_bundles: JsBundle[];
  source_maps: SourceMap[];
  target_url: string;
  captured_at: string;
  note?: string;
}
