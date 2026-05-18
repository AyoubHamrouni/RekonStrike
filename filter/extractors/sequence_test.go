package extractors

import (
	"context"
	"testing"

	"rekonstrike/filter/schema"
)

func TestSequence_GraphEdges(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", Timestamp: 1000, URL: "https://example.com/api/users", Method: "GET"},
			},
		},
		{
			NormalizedPath: "GET /api/posts",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r2", Timestamp: 1100, URL: "https://example.com/api/posts", Method: "GET"},
			},
		},
	}

	edges, _ := RunSequenceExtractor(context.Background(), groups)
	if len(edges) == 0 {
		t.Fatal("expected at least 1 graph edge")
	}
}

func TestSequence_RequiredSequence(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "POST /auth/login",
			Method:         "POST",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", Timestamp: 1000, URL: "https://example.com/auth/login", Method: "POST"},
				{ID: "r3", Timestamp: 3000, URL: "https://example.com/auth/login", Method: "POST"},
				{ID: "r5", Timestamp: 5000, URL: "https://example.com/auth/login", Method: "POST"},
			},
		},
		{
			NormalizedPath: "GET /api/data",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r2", Timestamp: 1100, URL: "https://example.com/api/data", Method: "GET"},
				{ID: "r4", Timestamp: 3100, URL: "https://example.com/api/data", Method: "GET"},
				{ID: "r6", Timestamp: 5100, URL: "https://example.com/api/data", Method: "GET"},
			},
		},
	}

	_, annotations := RunSequenceExtractor(context.Background(), groups)
	hasRequired := false
	for _, a := range annotations {
		if a.PatternType == "REQUIRED_SEQUENCE" {
			hasRequired = true
			break
		}
	}
	if !hasRequired {
		t.Fatal("expected REQUIRED_SEQUENCE annotation (login always precedes data)")
	}
}

func TestSequence_AuthFlow(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "POST /auth/login",
			Method:         "POST",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", Timestamp: 1000, URL: "https://example.com/auth/login", Method: "POST"},
			},
		},
		{
			NormalizedPath: "GET /api/profile",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r2", Timestamp: 1200, URL: "https://example.com/api/profile", Method: "GET"},
			},
		},
	}

	_, annotations := RunSequenceExtractor(context.Background(), groups)
	hasAuthFlow := false
	for _, a := range annotations {
		if a.PatternType == "AUTH_FLOW" {
			hasAuthFlow = true
			break
		}
	}
	if !hasAuthFlow {
		t.Fatal("expected AUTH_FLOW annotation")
	}
}

func TestSequence_SideEffect(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "POST /api/users",
			Method:         "POST",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", Timestamp: 1000, URL: "https://example.com/api/users", Method: "POST"},
			},
		},
		{
			NormalizedPath: "GET /api/users/1",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r2", Timestamp: 1100, URL: "https://example.com/api/users/1", Method: "GET"},
			},
		},
	}

	_, annotations := RunSequenceExtractor(context.Background(), groups)
	hasSideEffect := false
	for _, a := range annotations {
		if a.PatternType == "SIDE_EFFECT" {
			hasSideEffect = true
			break
		}
	}
	if !hasSideEffect {
		t.Fatal("expected SIDE_EFFECT annotation")
	}
}

func TestSequence_Empty(t *testing.T) {
	edges, annotations := RunSequenceExtractor(context.Background(), nil)
	if edges == nil {
		t.Fatal("expected non-nil edges slice")
	}
	if annotations == nil {
		t.Fatal("expected non-nil annotations slice")
	}
}
