package extractors

import (
	"context"
	"testing"

	"rekonstrike/filter/schema"
)

func TestAuth_JWTDecode(t *testing.T) {
	// JWT: {"alg":"HS256","typ":"JWT"}.{"sub":"123","role":"admin"}.
	payload := decodeJWTPayload("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJyb2xlIjoiYWRtaW4ifQ.signature")
	if payload == nil {
		t.Fatal("expected JWT payload to decode")
	}
	if payload["sub"] != "123" {
		t.Fatalf("expected sub=123, got %v", payload["sub"])
	}
	if payload["role"] != "admin" {
		t.Fatalf("expected role=admin, got %v", payload["role"])
	}
}

func TestAuth_JWTDecode_Malformed(t *testing.T) {
	payload := decodeJWTPayload("not-a-jwt")
	if payload != nil {
		t.Fatal("expected nil for malformed JWT")
	}
}

func TestAuth_PrivilegeChange(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "POST /auth/login",
			Method:         "POST",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r1", Timestamp: 1000, URL: "https://example.com/auth/login", Method: "POST",
					RequestHeaders: map[string]string{
						"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJyb2xlIjoidXNlciJ9.sig",
					},
				},
			},
		},
		{
			NormalizedPath: "POST /auth/upgrade",
			Method:         "POST",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r2", Timestamp: 1100, URL: "https://example.com/auth/upgrade", Method: "POST",
					RequestHeaders: map[string]string{
						"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJyb2xlIjoiYWRtaW4ifQ.sig",
					},
				},
			},
		},
		{
			NormalizedPath: "GET /api/admin",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r3", Timestamp: 1200, URL: "https://example.com/api/admin", Method: "GET",
					RequestHeaders: map[string]string{
						"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJyb2xlIjoiYWRtaW4ifQ.sig",
					},
				},
			},
		},
	}

	results := RunAuthExtractor(context.Background(), groups)
	hasPrivChange := false
	for _, r := range results {
		if r.PatternType == "PRIVILEGE_CHANGE" {
			hasPrivChange = true
			if r.TriggerRequest != "r1" {
				t.Fatalf("expected trigger request r1, got %s", r.TriggerRequest)
			}
			break
		}
	}
	if !hasPrivChange {
		t.Fatal("expected PRIVILEGE_CHANGE auth pattern")
	}
}

func TestAuth_SessionFixation(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/data",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r1", Timestamp: 1000, URL: "https://example.com/api/data", Method: "GET",
					RequestHeaders: map[string]string{"Cookie": "sessionid=abc"},
				},
				{
					ID: "r2", Timestamp: 2000, URL: "https://example.com/api/data", Method: "GET",
					RequestHeaders: map[string]string{"Cookie": "sessionid=xyz"},
				},
			},
		},
	}

	results := RunAuthExtractor(context.Background(), groups)
	hasFixation := false
	for _, r := range results {
		if r.PatternType == "SESSION_FIXATION" {
			hasFixation = true
			break
		}
	}
	if !hasFixation {
		t.Fatal("expected SESSION_FIXATION pattern (no login between cookie changes)")
	}
}

func TestAuth_CSRFWeakness(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "POST /api/data",
			Method:         "POST",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r1", Timestamp: 1000, URL: "https://example.com/api/data", Method: "POST",
					RequestHeaders: map[string]string{"X-CSRF-Token": "token123"},
				},
				{
					ID: "r2", Timestamp: 1100, URL: "https://example.com/api/data", Method: "POST",
					RequestHeaders: map[string]string{"X-CSRF-Token": "token123"},
				},
			},
		},
	}

	results := RunAuthExtractor(context.Background(), groups)
	hasCSRF := false
	for _, r := range results {
		if r.PatternType == "CSRF_WEAKNESS" {
			hasCSRF = true
			break
		}
	}
	if !hasCSRF {
		t.Fatal("expected CSRF_WEAKNESS (token not rotated)")
	}
}

func TestAuth_InconsistentAuth(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/data",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r1", Timestamp: 1000, URL: "https://example.com/api/data", Method: "GET",
					RequestHeaders: map[string]string{"Authorization": "Bearer tok1"},
					ResponseStatus: 200,
				},
				{
					ID: "r2", Timestamp: 1100, URL: "https://example.com/api/data", Method: "GET",
					RequestHeaders: map[string]string{},
					ResponseStatus: 200,
				},
			},
		},
	}

	results := RunAuthExtractor(context.Background(), groups)
	hasInconsistent := false
	for _, r := range results {
		if r.PatternType == "INCONSISTENT_AUTH" {
			hasInconsistent = true
			break
		}
	}
	if !hasInconsistent {
		t.Fatal("expected INCONSISTENT_AUTH (unauth request got 200)")
	}
}

func TestAuth_NoAuth(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/public",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", URL: "https://example.com/api/public", Method: "GET",
					RequestHeaders: map[string]string{"Accept": "application/json"}},
			},
		},
	}

	results := RunAuthExtractor(context.Background(), groups)
	// No auth signals at all should produce no findings
	if len(results) != 0 {
		t.Fatalf("expected 0 findings for no-auth endpoint, got %d", len(results))
	}
}
