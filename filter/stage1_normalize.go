package main

import (
	"encoding/json"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"rekonstrike/filter/schema"
)

var (
	uuidRe   = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	intRe    = regexp.MustCompile(`^\d+$`)
	emailRe  = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
	b64Re    = regexp.MustCompile(`^[A-Za-z0-9+/_\-]{16,}={0,2}$`)
	hexTokenRe = regexp.MustCompile(`^[0-9a-fA-F]{16,}$`)
	floatRe  = regexp.MustCompile(`^\d+\.\d+$`)
)

var staticExt = []string{
	".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".ico",
	".woff", ".woff2", ".svg", ".ttf", ".eot", ".map", ".pdf", ".zip",
}

var staticPathPrefixes = []string{
	"/static/", "/assets/", "/dist/", "/_next/static/", "/webpack/",
}

var reqDropHeaders = map[string]bool{
	"accept-encoding": true, "accept-language": true, "cache-control": true,
	"connection": true, "pragma": true, "te": true, "upgrade-insecure-requests": true,
}

var respDropHeaders = map[string]bool{
	"content-length": true, "transfer-encoding": true, "connection": true,
	"keep-alive": true, "x-cache": true, "cf-ray": true, "x-request-id": true,
}

var authCookieNames = []string{"sessionid", "session", "auth", "token", "jwt", "connect.sid", "sid"}

// ---------- Pass 1: Static asset elimination ----------

func passStaticElimination(reqs []schema.RawRequest) []schema.RawRequest {
	out := make([]schema.RawRequest, 0, len(reqs))
	for _, r := range reqs {
		if isStaticAsset(&r) {
			continue
		}
		out = append(out, r)
	}
	return out
}

func isStaticAsset(r *schema.RawRequest) bool {
	if r.ResponseStatus == 304 {
		return true
	}
	lowerURL := strings.ToLower(r.URL)
	for _, ext := range staticExt {
		if strings.HasSuffix(lowerURL, ext) {
			return true
		}
	}
	for _, prefix := range staticPathPrefixes {
		if strings.Contains(lowerURL, prefix) {
			return true
		}
	}
	ct := strings.ToLower(r.ContentType)
	if strings.HasPrefix(ct, "image/") || strings.HasPrefix(ct, "font/") || strings.Contains(ct, "text/css") {
		return true
	}
	return false
}

// ---------- Pass 2: URL normalization ----------

type normalizedURL struct {
	Scheme   string
	Host     string
	Path     string
	RawQuery string
	Params   []paramKV
}

type paramKV struct {
	Key   string
	Value string
}

func classifySegment(seg string) string {
	if seg == "" || seg == "{int}" || seg == "{uuid}" || seg == "{email}" || seg == "{token}" {
		return seg
	}
	if intRe.MatchString(seg) {
		return "{int}"
	}
	if uuidRe.MatchString(seg) {
		return "{uuid}"
	}
	if emailRe.MatchString(seg) {
		return "{email}"
	}
	if b64Re.MatchString(seg) || hexTokenRe.MatchString(seg) {
		return "{token}"
	}
	return seg
}

func classifyParamValue(val string) string {
	if val == "" {
		return "{empty}"
	}
	if intRe.MatchString(val) {
		return "{int}"
	}
	if floatRe.MatchString(val) {
		return "{float}"
	}
	if uuidRe.MatchString(val) {
		return "{uuid}"
	}
	if emailRe.MatchString(val) {
		return "{email}"
	}
	if b64Re.MatchString(val) || hexTokenRe.MatchString(val) {
		return "{token}"
	}
	if len(val) > 32 {
		return "{long_string}"
	}
	return "{enum}"
}

func parseNormalizeURL(rawURL string) *normalizedURL {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil
	}
	n := &normalizedURL{
		Scheme:   u.Scheme,
		Host:     u.Host,
		RawQuery: u.RawQuery,
	}
	parts := strings.Split(u.Path, "/")
	for i, seg := range parts {
		parts[i] = classifySegment(seg)
	}
	n.Path = strings.Join(parts, "/")
	n.Path = path.Clean(n.Path)
	if !strings.HasPrefix(n.Path, "/") {
		n.Path = "/" + n.Path
	}
	for name, vals := range u.Query() {
		v := ""
		if len(vals) > 0 {
			v = vals[0]
		}
		n.Params = append(n.Params, paramKV{Key: name, Value: v})
	}
	sort.Slice(n.Params, func(i, j int) bool {
		return n.Params[i].Key < n.Params[j].Key
	})
	return n
}

func buildNormalizedPath(method string, n *normalizedURL) string {
	var b strings.Builder
	b.WriteString(strings.ToUpper(method))
	b.WriteString(" ")
	b.WriteString(n.Path)
	if len(n.Params) > 0 {
		b.WriteString("?")
		for i, p := range n.Params {
			if i > 0 {
				b.WriteString("&")
			}
			b.WriteString(url.QueryEscape(p.Key))
			b.WriteString("=")
			b.WriteString(classifyParamValue(p.Value))
		}
	}
	return b.String()
}

// ---------- Pass 3: Deduplication ----------

func passDeduplicate(reqs []schema.RawRequest) []*schema.RequestGroup {
	groups := make(map[string]*schema.RequestGroup)
	order := make([]string, 0)

	for i := range reqs {
		r := &reqs[i]
		n := parseNormalizeURL(r.URL)
		if n == nil {
			continue
		}
		np := buildNormalizedPath(r.Method, n)
		g, exists := groups[np]
		if !exists {
			g = &schema.RequestGroup{
				NormalizedPath: np,
				Method:         strings.ToUpper(r.Method),
				CanonicalRequest: r,
				AllSamples:     []*schema.RawRequest{r},
				ObservedCount:  1,
				ParamTypes:     make(map[string]string),
				StatusCodes:    []int{r.ResponseStatus},
			}
			groups[np] = g
			order = append(order, np)
			for _, p := range n.Params {
				g.ParamTypes[p.Key] = classifyParamValue(p.Value)
			}
		} else {
			g.AllSamples = append(g.AllSamples, r)
			g.ObservedCount++
			if r.Timestamp < g.CanonicalRequest.Timestamp {
				g.CanonicalRequest = r
			}
			found := false
			for _, sc := range g.StatusCodes {
				if sc == r.ResponseStatus {
					found = true
					break
				}
			}
			if !found {
				g.StatusCodes = append(g.StatusCodes, r.ResponseStatus)
			}
			for _, p := range n.Params {
				existing, ok := g.ParamTypes[p.Key]
				class := classifyParamValue(p.Value)
				if ok && existing != class {
					g.ParamTypes[p.Key] = "{mixed}"
				} else if !ok {
					g.ParamTypes[p.Key] = class
				}
			}
		}
	}

	result := make([]*schema.RequestGroup, 0, len(order))
	for _, key := range order {
		result = append(result, groups[key])
	}
	return result
}

// ---------- Pass 4: Header normalization ----------

func passNormalizeHeaders(groups []*schema.RequestGroup) {
	for _, g := range groups {
		normalizeRequestHeaders(g.CanonicalRequest)
		normalizeResponseHeaders(g.CanonicalRequest)
		hasAuth := false
		hasAuthCookie := false
		for k, v := range g.CanonicalRequest.RequestHeaders {
			lk := strings.ToLower(k)
			if lk == "authorization" || lk == "x-api-key" || lk == "x-auth-token" {
				hasAuth = true
			}
			if lk == "cookie" {
				cv := strings.ToLower(v)
				for _, name := range authCookieNames {
					if strings.Contains(cv, name) {
						hasAuthCookie = true
						break
					}
				}
			}
		}
		if hasAuth && hasAuthCookie {
			g.MultiAuth = true
		}
	}
}

func normalizeRequestHeaders(r *schema.RawRequest) {
	for k := range r.RequestHeaders {
		lk := strings.ToLower(k)
		if reqDropHeaders[lk] {
			delete(r.RequestHeaders, k)
		}
	}
}

func normalizeResponseHeaders(r *schema.RawRequest) {
	for k := range r.ResponseHeaders {
		lk := strings.ToLower(k)
		if respDropHeaders[lk] {
			delete(r.ResponseHeaders, k)
		}
	}
}

// ---------- Pass 5: Body normalization ----------

func passNormalizeBodies(groups []*schema.RequestGroup) {
	for _, g := range groups {
		g.RequestBodySchema = extractBodySchema(g.CanonicalRequest.RequestBody, g.CanonicalRequest.ContentType)
		g.ResponseBodySchema = extractBodySchema(g.CanonicalRequest.ResponseBody, g.CanonicalRequest.ContentType)
	}
}

func extractBodySchema(body string, contentType string) string {
	if body == "" {
		return "{empty}"
	}
	ct := strings.ToLower(contentType)
	if strings.Contains(ct, "json") || (len(body) > 0 && (body[0] == '{' || body[0] == '[')) {
		var parsed interface{}
		if err := json.Unmarshal([]byte(body), &parsed); err == nil {
			keys := extractJSONKeys(parsed)
			sort.Strings(keys)
			if len(keys) == 0 {
				return "[]"
			}
			var b strings.Builder
			b.WriteString("[")
			for i, k := range keys {
				if i > 0 {
					b.WriteString(", ")
				}
				b.WriteString(k)
			}
			b.WriteString("]")
			return b.String()
		}
	}
	if strings.Contains(ct, "form-urlencoded") || strings.Contains(ct, "x-www-form-urlencoded") {
		vals, err := url.ParseQuery(body)
		if err == nil && len(vals) > 0 {
			keys := make([]string, 0, len(vals))
			for k := range vals {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			var b strings.Builder
			b.WriteString("form:[")
			for i, k := range keys {
				if i > 0 {
					b.WriteString(", ")
				}
				b.WriteString(k)
			}
			b.WriteString("]")
			return b.String()
		}
	}
	return "{opaque:type=" + ct + ",len=" + strconv.Itoa(len(body)) + "}"
}

func extractJSONKeys(v interface{}) []string {
	keys := make(map[string]bool)
	collectKeys(v, "", keys)
	result := make([]string, 0, len(keys))
	for k := range keys {
		result = append(result, k)
	}
	return result
}

func collectKeys(v interface{}, prefix string, keys map[string]bool) {
	switch val := v.(type) {
	case map[string]interface{}:
		for k, child := range val {
			fullKey := k
			if prefix != "" {
				fullKey = prefix + "." + k
			}
			keys[fullKey] = true
			collectKeys(child, fullKey, keys)
		}
	case []interface{}:
		if prefix != "" {
			keys[prefix+"[]"] = true
		}
		for _, item := range val {
			collectKeys(item, prefix, keys)
		}
	}
}

// ---------- Stage 1 entry point ----------

type stage1Result struct {
	groups []*schema.RequestGroup
	stats  schema.FilterStats
}

func runStage1(reqs []schema.RawRequest, debug bool) stage1Result {
	inputCount := len(reqs)

	s1 := passStaticElimination(reqs)
	droppedStatic := inputCount - len(s1)
	if debug {
		debugf("stage1 pass1 (static elimination): %d → %d requests", inputCount, len(s1))
	}

	groups := passDeduplicate(s1)
	droppedEmpty := len(s1) - len(groups)
	_ = droppedEmpty
	if debug {
		debugf("stage1 pass2+3 (normalize + dedup): %d groups from %d requests", len(groups), len(s1))
	}

	droppedDups := 0
	for _, g := range groups {
		droppedDups += g.ObservedCount - 1
	}

	passNormalizeHeaders(groups)
	if debug {
		multiAuthCount := 0
		for _, g := range groups {
			if g.MultiAuth {
				multiAuthCount++
			}
		}
		debugf("stage1 pass4 (header norm): %d multi-auth endpoints", multiAuthCount)
	}

	passNormalizeBodies(groups)
	if debug {
		jsonCount := 0
		for _, g := range groups {
			if strings.HasPrefix(g.RequestBodySchema, "[") || strings.HasPrefix(g.RequestBodySchema, "form:") {
				jsonCount++
			}
		}
		debugf("stage1 pass5 (body norm): %d structured bodies parsed", jsonCount)
	}

	return stage1Result{
		groups: groups,
		stats: schema.FilterStats{
			InputCount:          inputCount,
			DroppedStaticAssets: droppedStatic,
			DroppedDuplicates:   droppedDups,
			DroppedEmpty:        0,
			OutputCount:         len(groups),
		},
	}
}
