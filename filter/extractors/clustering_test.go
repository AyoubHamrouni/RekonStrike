package extractors

import (
	"context"
	"testing"

	"rekonstrike/filter/schema"
)

func TestClustering_SharedIDParameter(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users/{int}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", URL: "https://example.com/api/users/1", Method: "GET"},
				{ID: "r2", URL: "https://example.com/api/users/2", Method: "GET"},
				{ID: "r3", URL: "https://example.com/api/users/3", Method: "GET"},
			},
		},
		{
			NormalizedPath: "GET /api/posts/{int}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r4", URL: "https://example.com/api/posts/1", Method: "GET"},
				{ID: "r5", URL: "https://example.com/api/posts/2", Method: "GET"},
			},
		},
	}

	_, shared, _, _ := RunClusteringExtractor(context.Background(), groups)
	if len(shared) == 0 {
		t.Fatal("expected shared ID parameter detection (users and posts share values 1,2)")
	}
}

func TestClustering_PrivilegeEscalation(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/v1/users/{int}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", URL: "https://example.com/api/v1/users/1", Method: "GET"},
			},
		},
		{
			NormalizedPath: "GET /api/admin/users/{int}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r2", URL: "https://example.com/api/admin/users/1", Method: "GET"},
			},
		},
	}

	_, _, privEscs, _ := RunClusteringExtractor(context.Background(), groups)
	if len(privEscs) == 0 {
		t.Fatal("expected privilege escalation surface detection")
	}
	if privEscs[0].UserScopedPath != "GET /api/v1/users/{int}" {
		t.Fatalf("expected user path GET /api/v1/users/{int}, got %s", privEscs[0].UserScopedPath)
	}
}

func TestClustering_MassAssignment(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users/{int}",
			Method:         "GET",
			ResponseBodySchema: "[id, name, email]",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", URL: "https://example.com/api/users/1", Method: "GET",
					ResponseBody: `{"id":1,"name":"Alice","email":"a@x.com"}`},
			},
		},
		{
			NormalizedPath: "PUT /api/users/{int}",
			Method:         "PUT",
			RequestBodySchema: "[id, name, role, is_admin]",
			AllSamples: []*schema.RawRequest{
				{ID: "r2", URL: "https://example.com/api/users/1", Method: "PUT",
					RequestBody: `{"id":1,"name":"Alice","role":"admin","is_admin":true}`},
			},
		},
	}

	_, _, _, massAssigns := RunClusteringExtractor(context.Background(), groups)
	if len(massAssigns) == 0 {
		t.Fatal("expected mass assignment candidate detection")
	}
}

func TestClustering_ParamCluster(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users/{int}",
			Method:         "GET",
			ParamTypes:     map[string]string{"page": "{int}", "sort": "{enum}"},
		},
		{
			NormalizedPath: "GET /api/posts/{int}",
			Method:         "GET",
			ParamTypes:     map[string]string{"page": "{int}", "sort": "{enum}"},
		},
	}

	clusters, _, _, _ := RunClusteringExtractor(context.Background(), groups)
	if len(clusters) != 1 {
		t.Fatalf("expected 1 param-name cluster, got %d", len(clusters))
	}
}

func TestClustering_Empty(t *testing.T) {
	clusters, shared, privEsc, massAssign := RunClusteringExtractor(context.Background(), nil)
	if clusters == nil {
		t.Fatal("expected non-nil clusters")
	}
	if shared == nil {
		t.Fatal("expected non-nil shared params")
	}
	if privEsc == nil {
		t.Fatal("expected non-nil priv esc")
	}
	if massAssign == nil {
		t.Fatal("expected non-nil mass assign")
	}
}
