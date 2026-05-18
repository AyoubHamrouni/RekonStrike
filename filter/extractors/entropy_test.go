package extractors

import (
	"context"
	"math"
	"testing"

	"rekonstrike/filter/schema"
)

func TestEntropyOfDistribution_Constant(t *testing.T) {
	freq := map[string]int{"abc123": 5}
	h := entropyOfDistribution(freq, 5)
	if h != 0 {
		t.Fatalf("expected 0 entropy for constant, got %f", h)
	}
}

func TestEntropyOfDistribution_Uniform(t *testing.T) {
	freq := map[string]int{"a": 1, "b": 1, "c": 1, "d": 1}
	h := entropyOfDistribution(freq, 4)
	expected := 2.0 // log2(4) = 2
	if math.Abs(h-expected) > 0.01 {
		t.Fatalf("expected ~2.0 entropy for 4 uniform values, got %f", h)
	}
}

func TestClassifyParam_Constant(t *testing.T) {
	freq := map[string]int{"admin": 10}
	class, _, anomaly, _ := classifyParam(freq, 10, "{enum}", false)
	if class != "CONSTANT" {
		t.Fatalf("expected CONSTANT, got %s", class)
	}
	if anomaly != "" {
		t.Fatalf("expected no anomaly for simple constant, got %s", anomaly)
	}
}

func TestClassifyParam_ConstantHighEntropy(t *testing.T) {
	freq := map[string]int{"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0": 3}
	class, _, anomaly, _ := classifyParam(freq, 3, "{token}", false)
	if class != "CONSTANT" {
		t.Fatalf("expected CONSTANT, got %s", class)
	}
	if anomaly != "CONSTANT_BYPASS_ATTEMPT" {
		t.Fatalf("expected CONSTANT_BYPASS_ATTEMPT, got %s", anomaly)
	}
}

func TestClassifyParam_Enum(t *testing.T) {
	freq := map[string]int{"admin": 3, "user": 5, "guest": 2}
	class, _, _, _ := classifyParam(freq, 10, "{enum}", false)
	if class != "ENUM" {
		t.Fatalf("expected ENUM, got %s", class)
	}
}

func TestClassifyParam_LowEntropyIntPath(t *testing.T) {
	freq := map[string]int{"1": 3, "2": 2, "3": 1}
	class, _, anomaly, _ := classifyParam(freq, 6, "{int}", true)
	if class != "LOW_ENTROPY" {
		t.Fatalf("expected LOW_ENTROPY, got %s", class)
	}
	if anomaly != "IDOR_CANDIDATE" {
		t.Fatalf("expected IDOR_CANDIDATE, got %s", anomaly)
	}
}

func TestClassifyParam_HighEntropyPath(t *testing.T) {
	vals := make(map[string]int)
	for i := 0; i < 10; i++ {
		vals[randHex(16)] = 1
	}
	class, _, anomaly, _ := classifyParam(vals, 10, "{token}", true)
	if class != "HIGH_ENTROPY" {
		t.Fatalf("expected HIGH_ENTROPY, got %s", class)
	}
	if anomaly != "TOKEN_IN_PATH" {
		t.Fatalf("expected TOKEN_IN_PATH, got %s", anomaly)
	}
}

func TestClassifyParam_NearConstantDominance(t *testing.T) {
	// >80% same value → CONSTANT
	freq := map[string]int{"user": 9, "admin": 1}
	class, _, _, _ := classifyParam(freq, 10, "{enum}", false)
	if class != "CONSTANT" {
		t.Fatalf("expected CONSTANT (>80%% dominance), got %s", class)
	}
}

func TestRunEntropyExtractor_FindsHighEntropyQuery(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users/{int}?token={token}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", URL: "https://example.com/api/users/42?token=abc123xyz", Method: "GET"},
				{ID: "r2", URL: "https://example.com/api/users/43?token=def456uvw", Method: "GET"},
				{ID: "r3", URL: "https://example.com/api/users/44?token=ghi789rst", Method: "GET"},
			},
			ParamTypes: map[string]string{"token": "{token}"},
		},
	}

	results := RunEntropyExtractor(context.Background(), groups)
	hasHigh := false
	for _, r := range results {
		if r.Classification == "HIGH_ENTROPY" {
			hasHigh = true
			break
		}
	}
	if !hasHigh {
		t.Fatal("expected HIGH_ENTROPY classification for unique tokens")
	}
}

func TestRunEntropyExtractor_EnumQuery(t *testing.T) {
	groups := []schema.RequestGroup{
		{
			NormalizedPath: "GET /api/users?sort={enum}",
			Method:         "GET",
			AllSamples: []*schema.RawRequest{
				{ID: "r1", URL: "https://example.com/api/users?sort=asc", Method: "GET"},
				{ID: "r2", URL: "https://example.com/api/users?sort=desc", Method: "GET"},
				{ID: "r3", URL: "https://example.com/api/users?sort=asc", Method: "GET"},
			},
			ParamTypes: map[string]string{"sort": "{enum}"},
		},
	}

	results := RunEntropyExtractor(context.Background(), groups)
	hasEnum := false
	for _, r := range results {
		if r.Classification == "ENUM" {
			hasEnum = true
			break
		}
	}
	if !hasEnum {
		t.Fatal("expected ENUM classification for sort param")
	}
}

func TestRunEntropyExtractor_Empty(t *testing.T) {
	results := RunEntropyExtractor(context.Background(), nil)
	if results == nil {
		t.Fatal("expected empty slice, not nil")
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results for empty input, got %d", len(results))
	}
}

func TestClassifyParam_LowEntropySequential(t *testing.T) {
	freq := make(map[string]int)
	for i := 1; i <= 1000; i++ {
		val := string(rune('0' + (i%5)))
		freq[val]++
	}
	class, _, _, _ := classifyParam(freq, 1000, "{int}", false)
	if class != "LOW_ENTROPY" && class != "ENUM" {
		t.Fatalf("expected LOW_ENTROPY or ENUM for sequential ints, got %s", class)
	}
}

func TestClassifyParam_HighEntropyUUID(t *testing.T) {
	freq := make(map[string]int)
	for i := 0; i < 100; i++ {
		freq[randUUID(i)] = 1
	}
	class, _, _, _ := classifyParam(freq, 100, "{uuid}", true)
	if class != "HIGH_ENTROPY" {
		t.Fatalf("expected HIGH_ENTROPY for random UUIDs, got %s", class)
	}
}

var randHexOffset int

// Helper: generate a deterministic "random" hex string (unique per call)
func randHex(n int) string {
	randHexOffset++
	const chars = "0123456789abcdef"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[(i*7+randHexOffset*3)%16]
	}
	return string(b)
}

// Helper: generate a deterministic UUID-like string unique per seed value
func randUUID(seed int) string {
	const chars = "0123456789abcdef"
	b := make([]byte, 36)
	for pos := 0; pos < 36; pos++ {
		if pos == 8 || pos == 13 || pos == 18 || pos == 23 {
			b[pos] = '-'
		} else if pos < 8 {
			shift := uint((7 - pos) * 4)
			b[pos] = chars[(seed>>shift)&0xF]
		} else {
			idx := (seed*7 + pos*13) % 16
			if idx < 0 {
				idx = -idx
			}
			b[pos] = chars[idx]
		}
	}
	return string(b)
}
