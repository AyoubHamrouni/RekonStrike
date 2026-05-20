from typing import Any
from pydantic import BaseModel


class ParameterDef(BaseModel):
    name: str
    position: str  # "path" | "query"
    inferred_type: str  # "{int}", "{uuid}", "{token}", "{float}", "{enum}", "{string}"
    entropy: float = 0.0
    entropy_class: str = ""  # "ENUM", "CONSTANT", "RANDOM", "ID"
    enum_values: list[str] | None = None
    appears_in_response: bool = False


class Endpoint(BaseModel):
    method: str
    normalized_path: str
    observed_count: int = 0
    path_parameters: list[ParameterDef] = []
    query_parameters: list[ParameterDef] = []
    request_body_schema: str | None = None
    response_body_schema: str | None = None
    leaked_fields: list[str] = []
    auth_required: bool = False
    response_codes: list[int] = []
    predecessors: list[str] = []
    successors: list[str] = []


class ResourceFamily(BaseModel):
    family_id: str
    base_path: str
    endpoints: list[Endpoint]


class Anomaly(BaseModel):
    type: str
    severity: str  # "Critical" | "High" | "Medium" | "Low"
    endpoint: str  # "GET /api/users/{id}"
    evidence: str = ""
    test_hint: str = ""


class PrivilegeChange(BaseModel):
    trigger_endpoint: str = ""
    claims_changed: list[str] = []
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}


class SessionContext(BaseModel):
    auth_mechanisms: list[str] = []
    roles_detected: list[str] = []
    privilege_changes: list[PrivilegeChange] = []


class SequenceEdge(BaseModel):
    from_endpoint: str
    to_endpoint: str
    probability: float = 0.0
    is_required: bool = False


class FilterStats(BaseModel):
    input_count: int = 0
    dropped_static_assets: int = 0
    dropped_duplicates: int = 0
    dropped_empty: int = 0
    output_count: int = 0
    processing_time_ms: int = 0


class SurfaceCaptureInput(BaseModel):
    target: str
    captured_at: str = ""
    request_count: int = 0
    unique_endpoints: int = 0
    session_context: SessionContext = SessionContext()
    resource_families: list[ResourceFamily] = []
    sequences: list[SequenceEdge] = []
    anomalies: list[Anomaly] = []
    filter_stats: FilterStats | None = None


def build_llm_input(
    raw_captures: list[dict[str, Any]],
    anomalies: list[Anomaly] | None = None,
    target: str = "",
    max_families: int = 20,
    max_endpoints_per_family: int = 15,
) -> SurfaceCaptureInput:
    families_map: dict[str, list[Endpoint]] = {}

    for cap in raw_captures:
        method = cap.get("method", "GET")
        path = cap.get("path", "/")
        normalized = f"{method} {path}"
        base = _extract_base_path(path)

        ep = Endpoint(
            method=method,
            normalized_path=normalized,
            observed_count=1,
            auth_required=_has_auth_header(cap.get("headers", {})),
            response_codes=[cap.get("status_code", 200)],
        )

        key = base or "/"
        if key not in families_map:
            families_map[key] = []
        families_map[key].append(ep)

    sorted_families = sorted(
        families_map.items(),
        key=lambda x: len(x[1]),
        reverse=True,
    )[:max_families]

    families = []
    for base_path, eps in sorted_families:
        eps = _deduplicate_endpoints(eps)[:max_endpoints_per_family]
        families.append(ResourceFamily(
            family_id=base_path,
            base_path=base_path,
            endpoints=eps,
        ))

    endpoint_count = sum(len(f.endpoints) for f in families)

    return SurfaceCaptureInput(
        target=target,
        request_count=len(raw_captures),
        unique_endpoints=endpoint_count,
        resource_families=families,
        anomalies=anomalies or [],
    )


def _extract_base_path(path: str) -> str:
    segments = [s for s in path.strip("/").split("/") if s]
    if not segments:
        return "/"
    if len(segments) == 1:
        return "/" + segments[0]
    return "/" + segments[0] + "/" + segments[1]


def _has_auth_header(headers: dict) -> bool:
    if not headers:
        return False
    for k, v in headers.items():
        kl = k.lower()
        if kl == "authorization" and v:
            return True
        if kl == "cookie" and v:
            return True
    return False


def _deduplicate_endpoints(endpoints: list[Endpoint]) -> list[Endpoint]:
    seen: set[str] = set()
    result = []
    for ep in endpoints:
        key = f"{ep.method} {ep.normalized_path}"
        if key not in seen:
            seen.add(key)
            result.append(ep)
    return result
