package extractors

import (
	"context"
	"encoding/json"
	"net/url"
	"sort"
	"strings"

	"rekonstrike/filter/schema"
)

func RunDeltaExtractor(ctx context.Context, groups []schema.RequestGroup) ([]schema.Finding, []schema.SchemaStabilityFinding) {
	var findings []schema.Finding
	var stabilityFindings []schema.SchemaStabilityFinding

	for _, g := range groups {
		select {
		case <-ctx.Done():
			return findings, stabilityFindings
		default:
		}

		if len(g.AllSamples) < 1 {
			continue
		}

		parsedBodies := make([]map[string]interface{}, 0, len(g.AllSamples))
		bodyIndices := make([]int, 0)

		for i, s := range g.AllSamples {
			body := strings.TrimSpace(s.ResponseBody)
			if body == "" || (body[0] != '{' && body[0] != '[') {
				continue
			}
			var parsed map[string]interface{}
			if err := json.Unmarshal([]byte(body), &parsed); err != nil {
				continue
			}
			parsedBodies = append(parsedBodies, parsed)
			bodyIndices = append(bodyIndices, i)
		}

		if len(parsedBodies) < 1 {
			continue
		}

		// Schema stability
		keySets := make([]map[string]bool, len(parsedBodies))
		for i, p := range parsedBodies {
			ks := make(map[string]bool)
			for k := range p {
				ks[k] = true
			}
			keySets[i] = ks
		}

		allIdentical := true
		for i := 1; i < len(keySets); i++ {
			if !keySetsEqual(keySets[0], keySets[i]) {
				allIdentical = false
				break
			}
		}

		sf := schema.SchemaStabilityFinding{
			EndpointMethod: g.Method,
			EndpointPath:   g.NormalizedPath,
		}

		if allIdentical {
			sf.Stability = "STABLE_SCHEMA"
		} else {
			sf.Stability = "CONDITIONAL_SCHEMA"
			condParam := findConditionalParam(g, keySets, bodyIndices, parsedBodies)
			sf.ConditionalParam = condParam
		}

		// Leaked fields (only when request bodies are available for comparison)
		allRespKeys := make(map[string]bool)
		for _, ks := range keySets {
			for k := range ks {
				allRespKeys[k] = true
			}
		}

		allReqBodies := collectAllRequestBodies(g.AllSamples)
		leaked := make([]string, 0)
		if len(allReqBodies) > 0 {
			for k := range allRespKeys {
				foundInReq := false
				for _, rb := range allReqBodies {
					if strings.Contains(rb, `"`+k+`"`) {
						foundInReq = true
						break
					}
				}
				if !foundInReq {
					leaked = append(leaked, k)
				}
			}
			sort.Strings(leaked)
			if len(leaked) > 0 {
				sf.LeakedFields = leaked
			}
		}

		// Dead params: compare content across different path param values
		deadParams := findDeadParams(g, parsedBodies, bodyIndices)
		if len(deadParams) > 0 {
			sf.DeadParams = deadParams
		}

		stabilityFindings = append(stabilityFindings, sf)

		// Generate Findings from anomalies
		if sf.Stability == "CONDITIONAL_SCHEMA" {
			findings = append(findings, schema.Finding{
				Type:           "conditional_schema",
				Severity:       "medium",
				EndpointMethod: g.Method,
				EndpointPath:   g.NormalizedPath,
				Detail:         "Response schema varies based on parameter: " + sf.ConditionalParam,
				Evidence:       "Schema structure differs across requests",
			})
		}
		if len(leaked) > 0 {
			findings = append(findings, schema.Finding{
				Type:           "leaked_fields",
				Severity:       "high",
				EndpointMethod: g.Method,
				EndpointPath:   g.NormalizedPath,
				Detail:         "Response contains fields not present in any request body: " + strings.Join(leaked, ", "),
				Evidence:       "Server returning unrequested data — potential over-exposure",
			})
		}
		if len(deadParams) > 0 {
			findings = append(findings, schema.Finding{
				Type:           "dead_parameter",
				Severity:       "medium",
				EndpointMethod: g.Method,
				EndpointPath:   g.NormalizedPath,
				Detail:         "Path parameter does not affect response content: " + strings.Join(deadParams, ", "),
				Evidence:       "Different parameter values produce identical responses",
			})
		}
	}

	return findings, stabilityFindings
}

func keySetsEqual(a, b map[string]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if !b[k] {
			return false
		}
	}
	return true
}

func findConditionalParam(g schema.RequestGroup, keySets []map[string]bool, bodyIndices []int, parsedBodies []map[string]interface{}) string {
	if len(keySets) < 2 {
		return ""
	}

	baseline := keySets[0]
	for i := 1; i < len(keySets); i++ {
		if !keySetsEqual(baseline, keySets[i]) {
			// Find which param differs between these two requests
			reqA := g.AllSamples[bodyIndices[0]]
			reqB := g.AllSamples[bodyIndices[i]]
			diffParams := findURLParamDiffs(reqA, reqB)
			if len(diffParams) > 0 {
				return diffParams[0]
			}
		}
	}
	return ""
}

func findURLParamDiffs(a, b *schema.RawRequest) []string {
	ua, _ := url.Parse(a.URL)
	ub, _ := url.Parse(b.URL)
	if ua == nil || ub == nil {
		return nil
	}

	var diffs []string
	qa := ua.Query()
	qb := ub.Query()

	for k := range qa {
		va := qa.Get(k)
		vb := qb.Get(k)
		if va != vb {
			diffs = append(diffs, k)
		}
	}
	for k := range qb {
		if qa.Get(k) == "" {
			diffs = append(diffs, k)
		}
	}

	// Check path segments
	pa := strings.Split(ua.Path, "/")
	pb := strings.Split(ub.Path, "/")
	if len(pa) == len(pb) {
		for i := 0; i < len(pa); i++ {
			if pa[i] != pb[i] {
				diffs = append(diffs, "path_segment_"+string(rune(i+'0')))
			}
		}
	}

	return diffs
}

func findDeadParams(g schema.RequestGroup, parsedBodies []map[string]interface{}, bodyIndices []int) []string {
	if len(parsedBodies) < 2 {
		return nil
	}

	// Group by path param name to compare content across different param values
	groupsByParam := make(map[string][]int)

	normPathOnly := extractPathOnly(g.NormalizedPath)
	normParts := strings.Split(normPathOnly, "/")

	for idx, bodyIdx := range bodyIndices {
		s := g.AllSamples[bodyIdx]
		u, err := url.Parse(s.URL)
		if err != nil {
			continue
		}
		actualParts := strings.Split(u.Path, "/")

		for i, seg := range normParts {
			if isPlaceholder(seg) {
				if i < len(actualParts) {
					groupsByParam[seg] = append(groupsByParam[seg], idx)
				}
			}
		}
	}

	var deadParams []string
	for param, indices := range groupsByParam {
		if len(indices) < 2 {
			continue
		}
		allSame := true
		firstBody := parsedBodies[indices[0]]
		for _, idx := range indices[1:] {
			if !bodiesEqual(firstBody, parsedBodies[idx]) {
				allSame = false
				break
			}
		}
		if allSame {
			deadParams = append(deadParams, param)
		}
	}

	return deadParams
}

func bodiesEqual(a, b map[string]interface{}) bool {
	aJSON, _ := json.Marshal(a)
	bJSON, _ := json.Marshal(b)
	return string(aJSON) == string(bJSON)
}

func collectAllRequestBodies(samples []*schema.RawRequest) []string {
	var bodies []string
	for _, s := range samples {
		if s.RequestBody != "" {
			bodies = append(bodies, s.RequestBody)
		}
	}
	return bodies
}
