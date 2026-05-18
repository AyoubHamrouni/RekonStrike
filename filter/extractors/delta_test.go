package extractors

import (
	"context"
	"testing"

	"rekonstrike/filter/schema"
)

func TestDelta_StableSchema(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/health",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", ResponseBody: `{"status":"ok","version":"1.0"}`, ResponseStatus: 200},
				{ID: "r2", ResponseBody: `{"status":"ok","version":"1.0"}`, ResponseStatus: 200},
			},
		},
	}

	_, stability := RunDeltaExtractor(context.Background(), groups)
	if len(stability) != 1 {
		t.Fatalf("expected 1 stability finding, got %d", len(stability))
	}
	if stability[0].Stability != "STABLE_SCHEMA" {
		t.Fatalf("expected STABLE_SCHEMA, got %s", stability[0].Stability)
	}
}

func TestDelta_ConditionalSchema(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users/{int}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r1", URL: "https://example.com/api/users/1",
					ResponseBody: `{"id":1,"name":"Alice"}`, ResponseStatus: 200,
				},
				{
					ID: "r2", URL: "https://example.com/api/users/2",
					ResponseBody: `{"id":2,"name":"Bob","email":"bob@x.com"}`, ResponseStatus: 200,
				},
			},
		},
	}

	_, stability := RunDeltaExtractor(context.Background(), groups)
	if len(stability) != 1 {
		t.Fatalf("expected 1 stability finding, got %d", len(stability))
	}
	if stability[0].Stability != "CONDITIONAL_SCHEMA" {
		t.Fatalf("expected CONDITIONAL_SCHEMA, got %s", stability[0].Stability)
	}
}

func TestDelta_LeakedFields(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users/{int}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r1", URL: "https://example.com/api/users/1",
					RequestBody:  `{"id":1}`,
					ResponseBody: `{"id":1,"name":"Alice","secret_token":"s3cr3t"}`, ResponseStatus: 200,
				},
			},
		},
	}

	_, stability := RunDeltaExtractor(context.Background(), groups)
	if len(stability) != 1 {
		t.Fatalf("expected 1 stability finding, got %d", len(stability))
	}
	if len(stability[0].LeakedFields) == 0 {
		t.Fatal("expected leaked fields to be detected")
	}
}

func TestDelta_DeadParameter(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/items/{int}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{
					ID: "r1", URL: "https://example.com/api/items/1",
					ResponseBody: `{"data":"same"}`, ResponseStatus: 200,
				},
				{
					ID: "r2", URL: "https://example.com/api/items/2",
					ResponseBody: `{"data":"same"}`, ResponseStatus: 200,
				},
			},
		},
	}

	_, stability := RunDeltaExtractor(context.Background(), groups)
	if len(stability) != 1 {
		t.Fatalf("expected 1 stability finding, got %d", len(stability))
	}
	if len(stability[0].DeadParams) == 0 {
		t.Fatal("expected dead param to be detected when content is identical")
	}
}

func TestDelta_SingleSample(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users/{int}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", ResponseBody: `{"id":1}`, ResponseStatus: 200},
			},
		},
	}

	findings, stability := RunDeltaExtractor(context.Background(), groups)
	if len(findings) != 0 {
		t.Fatalf("expected 0 findings for single sample, got %d", len(findings))
	}
	if len(stability) != 1 {
		t.Fatalf("expected 1 stability entry for single sample, got %d", len(stability))
	}
}

func TestDelta_EmptyBody(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "DELETE /api/items/{int}",
			Method:         "DELETE",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", ResponseBody: "", ResponseStatus: 204},
			},
		},
	}

	findings, stability := RunDeltaExtractor(context.Background(), groups)
	if len(findings) != 0 {
		t.Fatalf("expected 0 findings for empty body, got %d", len(findings))
	}
	if len(stability) != 0 {
		t.Fatalf("expected 0 stability entries for empty body, got %d", len(stability))
	}
}
