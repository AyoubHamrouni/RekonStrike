"""Build synthetic SurfaceCapture fixtures for deterministic testing."""

from rekonstrike.ai.schemas.threat_model_input import (
    SurfaceCaptureInput,
    ResourceFamily,
    Endpoint,
    ParameterDef,
    Anomaly,
    SessionContext,
    SequenceEdge,
    PrivilegeChange,
)
from rekonstrike.ai.schemas.threat_model_output import (
    ThreatAssessment,
    ThreatFinding,
    AffectedEndpoint,
    PrivilegeEscalationChain,
)


def _simple_anomaly(
    type_: str,
    severity: str,
    endpoint: str,
    evidence: str = "",
    test_hint: str = "",
) -> Anomaly:
    return Anomaly(type=type_, severity=severity, endpoint=endpoint, evidence=evidence, test_hint=test_hint)


def build_simple_api() -> tuple[SurfaceCaptureInput, ThreatAssessment]:
    """Basic REST API with IDOR + privilege escalation surface."""
    surface = SurfaceCaptureInput(
        target="api.example.com",
        captured_at="2026-01-15T10:00:00Z",
        request_count=150,
        unique_endpoints=6,
        session_context=SessionContext(
            auth_mechanisms=["jwt"],
            roles_detected=["user", "admin"],
        ),
        resource_families=[
            ResourceFamily(
                family_id="/api/users",
                base_path="/api/users",
                endpoints=[
                    Endpoint(
                        method="GET",
                        normalized_path="GET /api/users/{id}",
                        observed_count=45,
                        path_parameters=[
                            ParameterDef(
                                name="id",
                                position="path",
                                inferred_type="{int}",
                                entropy=0.8,
                                entropy_class="ID",
                                appears_in_response=True,
                            )
                        ],
                        auth_required=True,
                        response_codes=[200, 403],
                    ),
                    Endpoint(
                        method="GET",
                        normalized_path="GET /api/users/me",
                        observed_count=30,
                        auth_required=True,
                        response_codes=[200],
                    ),
                ],
            ),
            ResourceFamily(
                family_id="/api/admin",
                base_path="/api/admin",
                endpoints=[
                    Endpoint(
                        method="GET",
                        normalized_path="GET /api/admin/users/{id}",
                        observed_count=10,
                        path_parameters=[
                            ParameterDef(
                                name="id",
                                position="path",
                                inferred_type="{int}",
                                entropy=0.8,
                                entropy_class="ID",
                                appears_in_response=True,
                            )
                        ],
                        auth_required=True,
                        response_codes=[200, 403],
                        leaked_fields=["internal_notes", "role"],
                    ),
                ],
            ),
            ResourceFamily(
                family_id="/api/auth",
                base_path="/api/auth",
                endpoints=[
                    Endpoint(
                        method="POST",
                        normalized_path="POST /api/auth/login",
                        observed_count=20,
                        auth_required=False,
                        response_codes=[200, 401],
                    ),
                    Endpoint(
                        method="POST",
                        normalized_path="POST /api/auth/upgrade",
                        observed_count=5,
                        auth_required=True,
                        response_codes=[200, 403],
                    ),
                ],
            ),
        ],
        anomalies=[
            _simple_anomaly("IDOR_CANDIDATE", "Critical", "GET /api/users/{id}",
                            "Integer path param with low entropy - enumerable",
                            "Try substituting your user ID into the {int} parameter"),
            _simple_anomaly("PRIVILEGE_ESCALATION_SURFACE", "High", "GET /api/users/{id} / GET /api/admin/users/{id}",
                            "User-scoped endpoint has admin equivalent",
                            "Try accessing admin endpoint with user session"),
            _simple_anomaly("SHARED_ID_PARAMETER", "Medium", "GET /api/users/{id}",
                            "Endpoints share same integer ID values",
                            "Try cross-endpoint ID reuse"),
        ],
        sequences=[
            SequenceEdge(from_endpoint="POST /api/auth/login", to_endpoint="GET /api/users/me", probability=0.95, is_required=True),
            SequenceEdge(from_endpoint="GET /api/users/me", to_endpoint="GET /api/users/{id}", probability=0.8, is_required=False),
        ],
    )

    golden = ThreatAssessment(
        target="api.example.com",
        model_used="haiku",
        risk_summary={"critical": 0, "high": 2, "medium": 0, "low": 0, "info": 0},
        findings=[
            ThreatFinding(
                finding_type="idor",
                finding_subtype="confirmed",
                risk_rank="high",
                affected_endpoints=[
                    AffectedEndpoint(
                        method="GET",
                        path="/api/users/{id}",
                        parameters=["id"],
                        evidence="Integer ID parameter with low entropy, appears in response",
                    )
                ],
                exploitation_description="Attacker with valid session can enumerate user IDs sequentially to access other users' profiles",
                exploitation_difficulty="easy",
                data_at_risk=["user_profiles"],
                affected_roles=["user"],
                confidence=0.9,
                recommended_test="Send GET /api/users/1 and GET /api/users/2 with same session, compare bodies",
                exploitation_chain=["Requires valid user session"],
            ),
            ThreatFinding(
                finding_type="privilege_escalation",
                finding_subtype="confirmed",
                risk_rank="high",
                affected_endpoints=[
                    AffectedEndpoint(method="GET", path="/api/users/{id}", parameters=["id"], evidence="User-scoped endpoint"),
                    AffectedEndpoint(method="GET", path="/api/admin/users/{id}", parameters=["id"], evidence="Admin-scoped endpoint with additional fields"),
                ],
                exploitation_description="User can access admin endpoint by reusing the same ID parameter pattern, gaining access to internal_notes and role fields",
                exploitation_difficulty="medium",
                data_at_risk=["internal_notes", "role_assignments"],
                affected_roles=["user"],
                confidence=0.85,
                recommended_test="With user session, send GET /api/admin/users/1 and compare response to GET /api/users/1",
                exploitation_chain=["Requires valid user session", "Requires known user ID"],
            ),
        ],
        privilege_escalation_chains=[
            PrivilegeEscalationChain(
                from_role="user",
                to_role="admin",
                path=["GET /api/users/{id}", "GET /api/admin/users/{id}"],
                finding_indices=[0, 1],
            ),
        ],
    )
    return surface, golden


def build_ecommerce() -> tuple[SurfaceCaptureInput, ThreatAssessment]:
    """E-commerce app with mass assignment + conditional schema + leaked fields."""
    surface = SurfaceCaptureInput(
        target="shop.example.com",
        captured_at="2026-01-15T10:00:00Z",
        request_count=300,
        unique_endpoints=8,
        session_context=SessionContext(
            auth_mechanisms=["session_cookie"],
            roles_detected=["user", "admin"],
        ),
        resource_families=[
            ResourceFamily(
                family_id="/api/users",
                base_path="/api/users",
                endpoints=[
                    Endpoint(
                        method="PUT",
                        normalized_path="PUT /api/users/profile",
                        observed_count=25,
                        auth_required=True,
                        response_codes=[200],
                        request_body_schema='{"name": "string", "email": "string", "is_admin": "boolean", "credit_balance": "number"}',
                        response_body_schema='{"id": "int", "name": "string", "email": "string"}',
                        leaked_fields=["is_admin", "credit_balance"],
                    ),
                    Endpoint(
                        method="GET",
                        normalized_path="GET /api/users/profile",
                        observed_count=30,
                        auth_required=True,
                        response_codes=[200],
                        response_body_schema='{"id": "int", "name": "string", "email": "string"}',
                    ),
                ],
            ),
            ResourceFamily(
                family_id="/api/orders",
                base_path="/api/orders",
                endpoints=[
                    Endpoint(
                        method="GET",
                        normalized_path="GET /api/orders/{id}",
                        observed_count=60,
                        path_parameters=[
                            ParameterDef(
                                name="id",
                                position="path",
                                inferred_type="{int}",
                                entropy=0.9,
                                entropy_class="ID",
                                appears_in_response=True,
                            )
                        ],
                        auth_required=True,
                        response_codes=[200, 403],
                        leaked_fields=["payment_method", "card_last4"],
                    ),
                ],
            ),
            ResourceFamily(
                family_id="/api/cart",
                base_path="/api/cart",
                endpoints=[
                    Endpoint(
                        method="GET",
                        normalized_path="GET /api/cart/items",
                        observed_count=40,
                        auth_required=True,
                        response_codes=[200],
                    ),
                    Endpoint(
                        method="POST",
                        normalized_path="POST /api/cart/items",
                        observed_count=15,
                        auth_required=True,
                        response_codes=[200, 400],
                    ),
                ],
            ),
        ],
        anomalies=[
            _simple_anomaly("MASS_ASSIGNMENT_CANDIDATE", "High", "PUT /api/users/profile",
                            "PUT body includes fields not in GET response: is_admin, credit_balance",
                            "Try sending PUT with hidden fields to see if accepted"),
            _simple_anomaly("CONDITIONAL_SCHEMA", "Medium", "GET /api/orders/{id}",
                            "Response schema varies by role",
                            "Check if different roles see different response fields"),
            _simple_anomaly("LEAKED_FIELDS", "High", "GET /api/orders/{id}",
                            "Response contains sensitive fields: payment_method, card_last4",
                            "Check if payment data is exposed in responses"),
        ],
        sequences=[],
    )

    golden = ThreatAssessment(
        target="shop.example.com",
        model_used="haiku",
        risk_summary={"critical": 0, "high": 2, "medium": 1, "low": 0, "info": 0},
        findings=[
            ThreatFinding(
                finding_type="mass_assignment",
                finding_subtype="confirmed",
                risk_rank="high",
                affected_endpoints=[
                    AffectedEndpoint(
                        method="PUT", path="/api/users/profile",
                        parameters=["is_admin", "credit_balance"],
                        evidence="PUT body has fields is_admin, credit_balance not returned in GET response",
                    )
                ],
                exploitation_description="Attacker can escalate to admin by including is_admin=true in PUT /api/users/profile request body",
                exploitation_difficulty="easy",
                data_at_risk=["admin_access", "credit_balances"],
                affected_roles=["user"],
                confidence=0.9,
                recommended_test="Send PUT /api/users/profile with {\"is_admin\": true} and verify if role changes",
                exploitation_chain=["Requires valid user session"],
            ),
            ThreatFinding(
                finding_type="information_disclosure",
                finding_subtype="confirmed",
                risk_rank="high",
                affected_endpoints=[
                    AffectedEndpoint(
                        method="GET", path="/api/orders/{id}", parameters=["id"],
                        evidence="Response includes payment_method and card_last4",
                    )
                ],
                exploitation_description="Order endpoint leaks partial payment card data. Combined with IDOR, attacker can harvest payment data across all orders",
                exploitation_difficulty="medium",
                data_at_risk=["payment_data", "card_last4", "payment_method"],
                affected_roles=["user"],
                confidence=0.85,
                recommended_test="Access GET /api/orders/1 and check for payment fields in response",
                exploitation_chain=["Requires valid user session", "Requires valid order ID"],
            ),
            ThreatFinding(
                finding_type="conditional_schema_leakage",
                finding_subtype="potential",
                risk_rank="medium",
                affected_endpoints=[
                    AffectedEndpoint(
                        method="GET", path="/api/orders/{id}", parameters=["id"],
                        evidence="Response schema is conditional, may differ by role",
                    )
                ],
                exploitation_description="Order endpoint returns different data based on role. Admin may see additional fields like full card numbers",
                exploitation_difficulty="medium",
                data_at_risk=["full_payment_data"],
                affected_roles=["admin"],
                confidence=0.65,
                recommended_test="Compare GET /api/orders/1 response as user vs admin to identify additional admin-only fields",
                exploitation_chain=["Requires admin session"],
            ),
        ],
        session_recommendations=[
            "Remove is_admin and credit_balance from PUT /api/users/profile accepted fields",
            "Mask payment data in order responses for non-admin roles",
        ],
    )
    return surface, golden


def build_token_leak() -> tuple[SurfaceCaptureInput, ThreatAssessment]:
    """Auth-related surface with token leakage + privilege change + missing CSRF."""
    surface = SurfaceCaptureInput(
        target="auth.example.com",
        captured_at="2026-01-15T10:00:00Z",
        request_count=120,
        unique_endpoints=5,
        session_context=SessionContext(
            auth_mechanisms=["jwt", "session_cookie"],
            roles_detected=["guest", "user", "admin"],
            privilege_changes=[
                PrivilegeChange(
                    trigger_endpoint="POST /api/auth/upgrade",
                    claims_changed=["role"],
                    before={"role": "user"},
                    after={"role": "admin"},
                )
            ],
        ),
        resource_families=[
            ResourceFamily(
                family_id="/api/auth",
                base_path="/api/auth",
                endpoints=[
                    Endpoint(
                        method="POST",
                        normalized_path="POST /api/auth/login",
                        observed_count=30,
                        auth_required=False,
                        response_codes=[200, 401],
                    ),
                    Endpoint(
                        method="POST",
                        normalized_path="POST /api/auth/refresh",
                        observed_count=15,
                        auth_required=True,
                        response_codes=[200],
                    ),
                    Endpoint(
                        method="POST",
                        normalized_path="POST /api/auth/upgrade",
                        observed_count=8,
                        auth_required=True,
                        response_codes=[200, 403],
                    ),
                ],
            ),
            ResourceFamily(
                family_id="/api",
                base_path="/api",
                endpoints=[
                    Endpoint(
                        method="POST",
                        normalized_path="POST /api/transfer",
                        observed_count=20,
                        auth_required=True,
                        response_codes=[200, 400, 403],
                    ),
                ],
            ),
        ],
        anomalies=[
            _simple_anomaly("TOKEN_IN_PATH", "High", "POST /api/auth/refresh",
                            "High-entropy token in URL query parameter",
                            "Check if token can be reused across sessions"),
            _simple_anomaly("PRIVILEGE_CHANGE_DETECTED", "Critical", "POST /api/auth/upgrade",
                            "JWT role claim changed from user to admin",
                            "Review the trigger endpoint that caused privilege escalation"),
            _simple_anomaly("CSRF_WEAKNESS", "Medium", "POST /api/transfer",
                            "CSRF token not rotated between state changes",
                            "Check if requests succeed without CSRF token"),
        ],
        sequences=[
            SequenceEdge(from_endpoint="POST /api/auth/login", to_endpoint="POST /api/auth/refresh", probability=0.7, is_required=False),
            SequenceEdge(from_endpoint="POST /api/auth/upgrade", to_endpoint="POST /api/transfer", probability=0.5, is_required=False),
        ],
    )

    golden = ThreatAssessment(
        target="auth.example.com",
        model_used="haiku",
        risk_summary={"critical": 1, "high": 1, "medium": 1, "low": 0, "info": 0},
        findings=[
            ThreatFinding(
                finding_type="token_leakage",
                finding_subtype="confirmed",
                risk_rank="high",
                affected_endpoints=[
                    AffectedEndpoint(
                        method="POST", path="/api/auth/refresh",
                        parameters=["token"],
                        evidence="JWT token passed as URL query parameter",
                    )
                ],
                exploitation_description="JWT token is exposed in URL query string of refresh endpoint, making it visible in server logs, browser history, and referrer headers",
                exploitation_difficulty="easy",
                data_at_risk=["session_tokens"],
                affected_roles=["user", "admin"],
                confidence=0.95,
                recommended_test="Check if refresh token appears in server access logs or Referer headers",
            ),
            ThreatFinding(
                finding_type="privilege_escalation",
                finding_subtype="confirmed",
                risk_rank="critical",
                affected_endpoints=[
                    AffectedEndpoint(
                        method="POST", path="/api/auth/upgrade",
                        evidence="JWT role claim changes from user to admin",
                    )
                ],
                exploitation_description="The POST /api/auth/upgrade endpoint promotes user to admin by changing the JWT role claim. If this endpoint lacks proper authorization checks, any user can escalate to admin",
                exploitation_difficulty="medium",
                data_at_risk=["admin_access", "all_user_data"],
                affected_roles=["user"],
                confidence=0.9,
                recommended_test="Send POST /api/auth/upgrade with user session and verify if JWT role changes to admin",
                exploitation_chain=["Requires valid user session"],
            ),
            ThreatFinding(
                finding_type="csrf",
                finding_subtype="confirmed",
                risk_rank="medium",
                affected_endpoints=[
                    AffectedEndpoint(
                        method="POST", path="/api/transfer",
                        evidence="CSRF token not rotated between state changes",
                    )
                ],
                exploitation_description="Transfer endpoint lacks CSRF protection, allowing attacker to initiate transfers via cross-site request forgery",
                exploitation_difficulty="easy",
                data_at_risk=["funds", "user_assets"],
                affected_roles=["user"],
                confidence=0.75,
                recommended_test="Submit cross-origin form POST to /api/transfer and check if request succeeds",
            ),
        ],
        privilege_escalation_chains=[
            PrivilegeEscalationChain(
                from_role="user",
                to_role="admin",
                path=["POST /api/auth/upgrade"],
                finding_indices=[1],
            ),
        ],
        session_recommendations=[
            "Move JWT token from query parameter to Authorization header",
            "Add role validation to /api/auth/upgrade endpoint",
            "Implement CSRF tokens for state-changing endpoints",
        ],
    )
    return surface, golden


def build_empty_surface() -> tuple[SurfaceCaptureInput, ThreatAssessment]:
    """Edge case: no traffic captured."""
    surface = SurfaceCaptureInput(
        target="empty.example.com",
        captured_at="2026-01-15T10:00:00Z",
    )
    golden = ThreatAssessment(
        target="empty.example.com",
        model_used="haiku",
        session_recommendations=[
            "No web surface captured. Run the proxy or import Burp/Caido data to generate a threat model.",
        ],
    )
    return surface, golden


FIXTURES = {
    "simple_api": build_simple_api(),
    "ecommerce": build_ecommerce(),
    "token_leak": build_token_leak(),
    "empty_surface": build_empty_surface(),
}
