package extractors

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"rekonstrike/filter/schema"
)

type timedRequest struct {
	req    *schema.RawRequest
	label  string
	method string
	path   string
}

func RunSequenceExtractor(ctx context.Context, groups []schema.RequestGroup) ([]schema.SequenceGraphEdge, []schema.SequenceAnnotation) {
	var all []timedRequest
	for _, g := range groups {
		for _, s := range g.AllSamples {
			all = append(all, timedRequest{
				req:    s,
				label:  g.Method + " " + g.NormalizedPath,
				method: g.Method,
				path:   g.NormalizedPath,
			})
		}
	}

	sort.Slice(all, func(i, j int) bool {
		return all[i].req.Timestamp < all[j].req.Timestamp
	})

	if len(all) == 0 {
		return []schema.SequenceGraphEdge{}, []schema.SequenceAnnotation{}
	}

	windowSize := 10
	if len(all) < windowSize {
		windowSize = len(all)
	}

	// Track predecessor/successor counts per endpoint
	type transition struct {
		to      string
		count   int
	}
	successorsByEp := make(map[string]map[string]int)
	predecessorsByEp := make(map[string]map[string]int)
	totalOccurrences := make(map[string]int)
	endpointLabels := make([]string, 0)
	labelSet := make(map[string]bool)

	for i, tr := range all {
		if !labelSet[tr.label] {
			labelSet[tr.label] = true
			endpointLabels = append(endpointLabels, tr.label)
		}
		totalOccurrences[tr.label]++

		// Successors: look ahead up to windowSize
		successors := make(map[string]int)
		maxJ := i + windowSize
		if maxJ > len(all) {
			maxJ = len(all)
		}
		for j := i + 1; j < maxJ; j++ {
			successors[all[j].label]++
		}
		if successorsByEp[tr.label] == nil {
			successorsByEp[tr.label] = successors
		} else {
			for k, v := range successors {
				successorsByEp[tr.label][k] += v
			}
		}

		// Predecessors: look behind up to windowSize
		minJ := i - windowSize
		if minJ < 0 {
			minJ = 0
		}
		predecessors := make(map[string]int)
		for j := i - 1; j >= minJ; j-- {
			predecessors[all[j].label]++
		}
		if predecessorsByEp[tr.label] == nil {
			predecessorsByEp[tr.label] = predecessors
		} else {
			for k, v := range predecessors {
				predecessorsByEp[tr.label][k] += v
			}
		}
	}

	// Build graph edges
	var edges []schema.SequenceGraphEdge
	edgeSeen := make(map[string]bool)

	for _, ep := range endpointLabels {
		select {
		case <-ctx.Done():
			return edges, nil
		default:
		}

		total := totalOccurrences[ep]
		if total == 0 {
			continue
		}
		succs := successorsByEp[ep]
		for toEp, count := range succs {
			weight := math.Round(float64(count)/float64(total)*100) / 100
			edgeKey := ep + "->" + toEp
			if !edgeSeen[edgeKey] {
				edges = append(edges, schema.SequenceGraphEdge{
					FromEndpoint: ep,
					ToEndpoint:   toEp,
					Weight:       weight,
					Observations: count,
				})
				edgeSeen[edgeKey] = true
			}
		}
	}

	sort.Slice(edges, func(i, j int) bool {
		return edges[i].Weight > edges[j].Weight
	})
	if len(edges) > 50 {
		edges = edges[:50]
	}

	// Annotations
	var annotations []schema.SequenceAnnotation

	// Required sequences: >80% co-occurrence
	annotations = append(annotations, detectRequiredSequences(endpointLabels, predecessorsByEp, totalOccurrences)...)

	// Auth flow mapping
	annotations = append(annotations, detectAuthFlow(all, windowSize)...)

	// Side effect detection
	annotations = append(annotations, detectSideEffects(all, windowSize)...)

	return edges, annotations
}

func detectRequiredSequences(endpointLabels []string, predecessorsByEp map[string]map[string]int, totalOccurrences map[string]int) []schema.SequenceAnnotation {
	var annotations []schema.SequenceAnnotation

	for _, ep := range endpointLabels {
		preds := predecessorsByEp[ep]
		if preds == nil || len(preds) == 0 {
			continue
		}
		total := totalOccurrences[ep]
		if total == 0 {
			continue
		}

		for predEp, count := range preds {
			prob := float64(count) / float64(total)
			if prob > 0.8 {
				// Check if this endpoint appears without its predecessor
				predTotal := totalOccurrences[predEp]
				coOccurrences := 0
				if predSuccs, ok := predecessorsByEp[predEp]; ok {
					coOccurrences = predSuccs[ep]
				}

				if float64(coOccurrences)/float64(predTotal) > 0.9 || predTotal == 0 {
					annotations = append(annotations, schema.SequenceAnnotation{
						PatternType:    "REQUIRED_SEQUENCE",
						Endpoints:      []string{predEp, ep},
						SecuritySignal: true,
						Description:    fmt.Sprintf("%s → %s occurs in %.0f%% of observations", predEp, ep, prob*100),
					})
				} else {
					annotations = append(annotations, schema.SequenceAnnotation{
						PatternType:    "SEQUENCE_BYPASS",
						Endpoints:      []string{predEp, ep},
						SecuritySignal: true,
						Description:    fmt.Sprintf("%s can be reached without %s — possible bypass", ep, predEp),
					})
				}
			}
		}
	}
	return annotations
}

func detectAuthFlow(all []timedRequest, windowSize int) []schema.SequenceAnnotation {
	authKeywords := []string{"/login", "/auth", "/signin", "/oauth", "/token", "/refresh"}

	var annotations []schema.SequenceAnnotation

	for i, tr := range all {
		lowerPath := strings.ToLower(tr.path)
		isAuth := false
		for _, kw := range authKeywords {
			if strings.Contains(lowerPath, kw) {
				isAuth = true
				break
			}
		}
		if !isAuth || tr.method != "POST" {
			continue
		}

		// Look ahead within 5s for endpoints called after auth
		var flowEndpoints []string
		flowEndpoints = append(flowEndpoints, tr.label)

		for j := i + 1; j < len(all) && j <= i+windowSize; j++ {
			delta := all[j].req.Timestamp - tr.req.Timestamp
			if delta > 5000 {
				break
			}
			flowEndpoints = append(flowEndpoints, all[j].label)
		}

		if len(flowEndpoints) > 1 {
			annotations = append(annotations, schema.SequenceAnnotation{
				PatternType:    "AUTH_FLOW",
				Endpoints:      flowEndpoints,
				SecuritySignal: false,
				Description:    "Auth endpoint triggers subsequent access to " + fmt.Sprintf("%d endpoints", len(flowEndpoints)-1),
			})
		}
	}

	return annotations
}

func detectSideEffects(all []timedRequest, windowSize int) []schema.SequenceAnnotation {
	var annotations []schema.SequenceAnnotation

	for i, tr := range all {
		if tr.method != "POST" && tr.method != "PUT" && tr.method != "DELETE" && tr.method != "PATCH" {
			continue
		}

		basePath := extractBasePath(tr.path)

		var sideEffects []string
		for j := i + 1; j < len(all) && j <= i+windowSize; j++ {
			delta := all[j].req.Timestamp - tr.req.Timestamp
			if delta > 2000 {
				break
			}
			if all[j].method == "GET" || all[j].method == "HEAD" {
				effectPath := extractBasePath(all[j].path)
				if strings.HasPrefix(effectPath, basePath) {
					sideEffects = append(sideEffects, all[j].label)
				}
			}
		}

		if len(sideEffects) > 0 {
			unique := make(map[string]bool)
			var deduped []string
			for _, se := range sideEffects {
				if !unique[se] {
					unique[se] = true
					deduped = append(deduped, se)
				}
			}
			endpoints := []string{tr.label}
			endpoints = append(endpoints, deduped...)

			annotations = append(annotations, schema.SequenceAnnotation{
				PatternType:    "SIDE_EFFECT",
				Endpoints:      endpoints,
				SecuritySignal: false,
				Description:    fmt.Sprintf("State-changing %s followed by GET/HEAD on same resource", tr.method),
			})
		}
	}

	return annotations
}

func extractBasePath(normalizedPath string) string {
	parts := strings.SplitN(normalizedPath, " ", 2)
	if len(parts) != 2 {
		return normalizedPath
	}
	pathOnly := parts[1]
	queryIdx := strings.Index(pathOnly, "?")
	if queryIdx >= 0 {
		return pathOnly[:queryIdx]
	}
	return pathOnly
}
