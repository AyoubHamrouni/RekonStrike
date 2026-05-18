package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"rekonstrike/filter/schema"
)

func endpointByPath(families []schema.ResourceFamily, method, path string) *schema.Endpoint {
	for _, f := range families {
		for i := range f.Endpoints {
			ep := &f.Endpoints[i]
			if ep.Method == method && ep.NormalizedPath == path {
				return ep
			}
		}
	}
	return nil
}

func TestFullPipeline_BasicFlow(t *testing.T) {
	reqs := []schema.RawRequest{
		{ID: "1", Timestamp: 1000, Method: "GET", URL: "https://example.com/app.js", ContentType: "application/javascript", ResponseStatus: 200},
		{ID: "2", Timestamp: 1001, Method: "GET", URL: "https://example.com/api/users/123?page=1", ResponseStatus: 200, ResponseBody: `{"id":123,"name":"Alice"}`},
		{ID: "3", Timestamp: 1002, Method: "GET", URL: "https://example.com/api/users/456?page=2", ResponseStatus: 200, ResponseBody: `{"id":456,"name":"Bob"}`},
		{ID: "4", Timestamp: 1003, Method: "POST", URL: "https://example.com/api/users", ResponseStatus: 201, RequestBody: `{"name":"Carol"}`, ContentType: "application/json"},
	}

	result := RunPipeline(reqs, false)

	if result.Target != "example.com" {
		t.Fatalf("expected target example.com, got %s", result.Target)
	}
	if result.RequestCount != 4 {
		t.Fatalf("expected 4 total requests, got %d", result.RequestCount)
	}
	if result.UniqueEndpoints == 0 {
		t.Fatal("expected at least 1 endpoint")
	}
}

func TestFullPipeline_StaticAssetFiltering(t *testing.T) {
	reqs := []schema.RawRequest{
		{ID: "1", Method: "GET", URL: "https://example.com/style.css", ContentType: "text/css", ResponseStatus: 200},
		{ID: "2", Method: "GET", URL: "https://example.com/script.js", ResponseStatus: 200},
		{ID: "3", Method: "GET", URL: "https://example.com/image.png", ContentType: "image/png", ResponseStatus: 200},
		{ID: "4", Method: "GET", URL: "https://example.com/api/data", ResponseStatus: 200, ResponseBody: `{"key":"value"}`},
	}

	result := RunPipeline(reqs, false)

	if result.UniqueEndpoints != 1 {
		t.Fatalf("expected 1 endpoint (only the API call), got %d", result.UniqueEndpoints)
	}
	ep := endpointByPath(result.ResourceFamilies, "GET", "GET /api/data")
	if ep == nil {
		t.Fatal("expected GET /api/data endpoint")
	}
}

func TestFullPipeline_PathNormalization(t *testing.T) {
	reqs := []schema.RawRequest{
		{ID: "1", Timestamp: 1000, Method: "GET", URL: "https://example.com/api/users/123", ResponseStatus: 200},
		{ID: "2", Timestamp: 1001, Method: "GET", URL: "https://example.com/api/users/456", ResponseStatus: 200},
		{ID: "3", Timestamp: 1002, Method: "GET", URL: "https://example.com/api/users/abc-uuid-1234-def", ResponseStatus: 200},
	}

	result := RunPipeline(reqs, false)

	if result.UniqueEndpoints != 2 {
		t.Fatalf("expected 2 endpoints (int and uuid), got %d", result.UniqueEndpoints)
	}
}

func TestFullPipeline_Deduplication(t *testing.T) {
	reqs := []schema.RawRequest{
		{ID: "1", Timestamp: 1000, Method: "GET", URL: "https://example.com/api/items?page=1", ResponseStatus: 200},
		{ID: "2", Timestamp: 1001, Method: "GET", URL: "https://example.com/api/items?page=2", ResponseStatus: 200},
		{ID: "3", Timestamp: 1002, Method: "GET", URL: "https://example.com/api/items?page=3", ResponseStatus: 200},
	}

	result := RunPipeline(reqs, false)

	if result.UniqueEndpoints != 1 {
		t.Fatalf("expected 1 unique endpoint, got %d", result.UniqueEndpoints)
	}
	ep := endpointByPath(result.ResourceFamilies, "GET", "GET /api/items?page={int}")
	if ep == nil {
		t.Fatal("expected GET /api/items?page={int} endpoint")
	}
	if ep.ObservedCount != 3 {
		t.Fatalf("expected observed_count 3, got %d", ep.ObservedCount)
	}
}

func TestFullPipeline_MultiAuthDetection(t *testing.T) {
	reqs := []schema.RawRequest{
		{
			ID:     "1",
			Method: "GET",
			URL:    "https://example.com/api/secure",
			RequestHeaders: map[string]string{
				"Authorization": "Bearer token123",
				"Cookie":        "sessionid=abc123",
			},
			ResponseStatus: 200,
		},
	}

	result := RunPipeline(reqs, false)

	ep := endpointByPath(result.ResourceFamilies, "GET", "GET /api/secure")
	if ep == nil {
		t.Fatal("expected GET /api/secure endpoint")
	}
	if !ep.AuthRequired {
		t.Fatal("expected AuthRequired to be true")
	}
}

func TestFullPipeline_EmptyInput(t *testing.T) {
	result := RunPipeline([]schema.RawRequest{}, false)
	if result.UniqueEndpoints != 0 {
		t.Fatalf("expected 0 endpoints for empty input, got %d", result.UniqueEndpoints)
	}
	if len(result.ResourceFamilies) != 0 {
		t.Fatalf("expected 0 resource families, got %d", len(result.ResourceFamilies))
	}
}

func TestFullPipeline_DebugMode(t *testing.T) {
	reqs := []schema.RawRequest{
		{ID: "1", Method: "GET", URL: "https://example.com/api/data", ResponseStatus: 200},
	}
	result := RunPipeline(reqs, true)
	if result.UniqueEndpoints != 1 {
		t.Fatalf("expected 1 endpoint with debug mode, got %d", result.UniqueEndpoints)
	}
}

func TestFullPipeline_Idempotent(t *testing.T) {
	reqs := []schema.RawRequest{
		{ID: "1", Timestamp: 100, Method: "GET", URL: "https://example.com/api/users/1", ResponseStatus: 200, ResponseBody: `{"id":1}`},
		{ID: "2", Timestamp: 200, Method: "POST", URL: "https://example.com/api/login", ResponseStatus: 200, RequestBody: `{"user":"a"}`, ContentType: "application/json"},
	}

	r1 := RunPipeline(reqs, false)
	r2 := RunPipeline(reqs, false)

	if r1.UniqueEndpoints != r2.UniqueEndpoints {
		t.Fatal("endpoint count differs between runs")
	}
}

func TestFullPipeline_HeaderNormalization(t *testing.T) {
	reqs := []schema.RawRequest{
		{
			ID:     "1",
			Method: "GET",
			URL:    "https://example.com/api/data",
			RequestHeaders: map[string]string{
				"Accept-Encoding": "gzip",
				"Authorization":   "Bearer test",
				"Cache-Control":   "no-cache",
				"X-Custom-Header": "custom-value",
			},
			ResponseHeaders: map[string]string{
				"Content-Length":    "100",
				"Content-Type":      "application/json",
				"X-Request-ID":     "abc-123",
				"WWW-Authenticate": "Bearer",
			},
			ResponseStatus: 200,
		},
	}

	result := RunPipeline(reqs, false)

	for _, f := range result.ResourceFamilies {
		for _, ep := range f.Endpoints {
			if ep.NormalizedPath != "GET /api/data" {
				continue
			}
			canon := findCanonicalRequest(reqs, &ep)
			if canon != nil {
				for k := range canon.RequestHeaders {
					lk := strings.ToLower(k)
					if lk == "accept-encoding" || lk == "cache-control" {
						t.Fatalf("header %s should have been dropped", k)
					}
				}
				if canon.RequestHeaders["Authorization"] != "Bearer test" {
					t.Fatal("Authorization header should be preserved")
				}
				if canon.RequestHeaders["X-Custom-Header"] != "custom-value" {
					t.Fatal("X-Custom-Header should be preserved")
				}
				for k := range canon.ResponseHeaders {
					lk := strings.ToLower(k)
					if lk == "content-length" || lk == "x-request-id" {
						t.Fatalf("response header %s should have been dropped", k)
					}
				}
				if canon.ResponseHeaders["WWW-Authenticate"] != "Bearer" {
					t.Fatal("WWW-Authenticate should be preserved")
				}
			}
		}
	}
}

func findCanonicalRequest(reqs []schema.RawRequest, ep *schema.Endpoint) *schema.RawRequest {
	pathParts := strings.SplitN(ep.NormalizedPath, " ", 2)
	if len(pathParts) != 2 {
		return nil
	}
	for i := range reqs {
		if strings.Contains(reqs[i].URL, pathParts[1]) && reqs[i].Method == ep.Method {
			return &reqs[i]
		}
	}
	return nil
}

func TestFullPipeline_304Filtering(t *testing.T) {
	reqs := []schema.RawRequest{
		{ID: "1", Method: "GET", URL: "https://example.com/api/data", ResponseStatus: 304},
		{ID: "2", Method: "GET", URL: "https://example.com/api/items", ResponseStatus: 200, ResponseBody: `{"items":[]}`},
	}

	result := RunPipeline(reqs, false)
	if result.UniqueEndpoints != 1 {
		t.Fatalf("expected 1 endpoint (304 filtered), got %d", result.UniqueEndpoints)
	}
}

func TestFullPipeline_1000Dedup(t *testing.T) {
	reqs := make([]schema.RawRequest, 1000)
	for i := 0; i < 1000; i++ {
		reqs[i] = schema.RawRequest{
			ID:     string(rune('0' + i%10)),
			Method: "GET",
			URL:    "https://example.com/api/items",
			ResponseStatus: 200,
		}
	}

	result := RunPipeline(reqs, false)
	if result.UniqueEndpoints != 1 {
		t.Fatalf("expected 1 unique endpoint, got %d", result.UniqueEndpoints)
	}
	ep := endpointByPath(result.ResourceFamilies, "GET", "GET /api/items")
	if ep == nil {
		t.Fatal("expected GET /api/items endpoint")
	}
	if ep.ObservedCount != 1000 {
		t.Fatalf("expected observed_count 1000, got %d", ep.ObservedCount)
	}
	if result.FilterStats.InputCount != 1000 {
		t.Fatalf("expected InputCount 1000, got %d", result.FilterStats.InputCount)
	}
	if result.FilterStats.DroppedDuplicates != 999 {
		t.Fatalf("expected DroppedDuplicates 999, got %d", result.FilterStats.DroppedDuplicates)
	}
}

func TestFilterStats_Tracking(t *testing.T) {
	reqs := []schema.RawRequest{
		{ID: "1", Method: "GET", URL: "https://example.com/style.css", ContentType: "text/css", ResponseStatus: 200},
		{ID: "2", Method: "GET", URL: "https://example.com/script.js", ResponseStatus: 200},
		{ID: "3", Method: "GET", URL: "https://example.com/api/data", ResponseStatus: 200},
		{ID: "4", Method: "GET", URL: "https://example.com/api/data", ResponseStatus: 200},
		{ID: "5", Method: "GET", URL: "https://example.com/api/other", ResponseStatus: 200},
	}

	result := RunPipeline(reqs, false)

	if result.FilterStats.InputCount != 5 {
		t.Fatalf("expected InputCount 5, got %d", result.FilterStats.InputCount)
	}
	if result.FilterStats.DroppedStaticAssets != 2 {
		t.Fatalf("expected DroppedStaticAssets 2, got %d", result.FilterStats.DroppedStaticAssets)
	}
	if result.FilterStats.DroppedDuplicates != 1 {
		t.Fatalf("expected DroppedDuplicates 1, got %d", result.FilterStats.DroppedDuplicates)
	}
	if result.FilterStats.OutputCount != 2 {
		t.Fatalf("expected OutputCount 2, got %d", result.FilterStats.OutputCount)
	}
	if result.FilterStats.ProcessingTimeMs < 0 {
		t.Fatal("expected ProcessingTimeMs >= 0")
	}
}

func TestFullPipeline_RealisticFixture(t *testing.T) {
	f, err := os.Open("testdata/realistic_traffic.json")
	if err != nil {
		t.Skip("testdata/realistic_traffic.json not found:", err)
	}
	defer f.Close()

	var reqs []schema.RawRequest
	if err := json.NewDecoder(f).Decode(&reqs); err != nil {
		t.Fatalf("failed to decode fixture: %v", err)
	}
	if len(reqs) == 0 {
		t.Fatal("fixture contains no requests")
	}

	result := RunPipeline(reqs, false)

	if result.Target == "" {
		t.Fatal("expected non-empty target")
	}
	if result.RequestCount != len(reqs) {
		t.Fatalf("expected request_count %d, got %d", len(reqs), result.RequestCount)
	}
	if result.UniqueEndpoints == 0 {
		t.Fatal("expected at least 1 endpoint")
	}
	if len(result.ResourceFamilies) == 0 {
		t.Fatal("expected at least 1 resource family")
	}
	if len(result.Anomalies) == 0 {
		t.Log("no anomalies found in realistic fixture (may be expected)")
	}
	if result.FilterStats.InputCount != len(reqs) {
		t.Fatalf("expected InputCount %d, got %d", len(reqs), result.FilterStats.InputCount)
	}
	if result.FilterStats.ProcessingTimeMs < 0 {
		t.Fatal("expected ProcessingTimeMs >= 0")
	}

	totalFound := 0
	for _, f := range result.ResourceFamilies {
		totalFound += len(f.Endpoints)
	}
	if totalFound != result.UniqueEndpoints {
		t.Fatalf("endpoint count mismatch: families have %d, UniqueEndpoints says %d", totalFound, result.UniqueEndpoints)
	}
}
