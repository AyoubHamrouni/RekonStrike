package extractors

import (
	"context"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"rekonstrike/filter/schema"
)

func RunClusteringExtractor(ctx context.Context, groups []schema.RequestGroup) (
	[]schema.ClusterInfo,
	[]schema.SharedIDParameter,
	[]schema.PrivilegeEscalationSurface,
	[]schema.MassAssignmentCandidate,
) {

	sharedIDs := detectSharedIDParameters(ctx, groups)
	privEscs := detectPrivilegeEscalation(ctx, groups)
	massAssigns := detectMassAssignment(ctx, groups)

	if ctx.Err() != nil {
		return make([]schema.ClusterInfo, 0), sharedIDs, privEscs, massAssigns
	}

	// Also run the existing param-name-based clustering
	paramClusters := runParamClustering(ctx, groups)

	return paramClusters, sharedIDs, privEscs, massAssigns
}

// Shared ID Parameters: endpoints whose path {int} segments receive overlapping integer values
func detectSharedIDParameters(ctx context.Context, groups []schema.RequestGroup) []schema.SharedIDParameter {
	type segmentInfo struct {
		label  string
		values map[int]bool
	}
	segments := make([]segmentInfo, 0)

	for _, g := range groups {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		normPathOnly := extractPathOnly(g.NormalizedPath)
		normParts := strings.Split(normPathOnly, "/")

		for i, seg := range normParts {
			if seg != "{int}" {
				continue
			}
			vals := make(map[int]bool)
			for _, s := range g.AllSamples {
				u, err := url.Parse(s.URL)
				if err != nil {
					continue
				}
				actualParts := strings.Split(u.Path, "/")
				if i < len(actualParts) {
					if v, err := strconv.Atoi(actualParts[i]); err == nil {
						vals[v] = true
					}
				}
			}
			if len(vals) > 0 {
				label := g.Method + " " + g.NormalizedPath + ":" + seg + "[" + strconv.Itoa(i) + "]"
				segments = append(segments, segmentInfo{label: label, values: vals})
			}
		}
	}

	results := make([]schema.SharedIDParameter, 0)
	seen := make(map[string]bool)

	for i := 0; i < len(segments); i++ {
		for j := i + 1; j < len(segments); j++ {
			select {
			case <-ctx.Done():
				return results
			default:
			}

			overlap := intersectIntSets(segments[i].values, segments[j].values)
			if len(overlap) > 0 {
				orderedVals := make([]int, 0, len(overlap))
				for v := range overlap {
					orderedVals = append(orderedVals, v)
				}
				sort.Ints(orderedVals)

				key := segments[i].label + "|" + segments[j].label
				revKey := segments[j].label + "|" + segments[i].label
				if !seen[key] && !seen[revKey] {
					seen[key] = true
					endpoints := []string{segments[i].label, segments[j].label}
					sort.Strings(endpoints)

					results = append(results, schema.SharedIDParameter{
						ParameterName:  "{int}",
						Endpoints:      endpoints,
						ObservedValues: orderedVals,
						OverlapCount:   len(overlap),
					})
				}
			}
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].OverlapCount > results[j].OverlapCount
	})

	return results
}

func intersectIntSets(a, b map[int]bool) map[int]bool {
	r := make(map[int]bool)
	for v := range a {
		if b[v] {
			r[v] = true
		}
	}
	return r
}

// Privilege escalation: detect user-scoped vs admin-scoped paths for the same resource
func detectPrivilegeEscalation(ctx context.Context, groups []schema.RequestGroup) []schema.PrivilegeEscalationSurface {
	results := make([]schema.PrivilegeEscalationSurface, 0)

	type resourceInfo struct {
		path  string
		label string
	}

	var userResources []resourceInfo
	var adminResources []resourceInfo

	for _, g := range groups {
		select {
		case <-ctx.Done():
			return results
		default:
		}

		pathOnly := extractPathOnly(g.NormalizedPath)
		lower := strings.ToLower(pathOnly)

		label := g.NormalizedPath

		if strings.Contains(lower, "/admin/") || strings.HasSuffix(lower, "/admin") {
			adminResources = append(adminResources, resourceInfo{path: pathOnly, label: label})
		} else if !strings.Contains(lower, "/static/") && !strings.Contains(lower, "/assets/") {
			userResources = append(userResources, resourceInfo{path: pathOnly, label: label})
		}
	}

	for _, user := range userResources {
		for _, admin := range adminResources {
			select {
			case <-ctx.Done():
				return results
			default:
			}

			if isSameResourceDifferentScope(user.path, admin.path) {
				resourceName := extractResourceName(user.path)
				results = append(results, schema.PrivilegeEscalationSurface{
					ResourceName:    resourceName,
					UserScopedPath:  user.label,
					AdminScopedPath: admin.label,
				})
			}
		}
	}

	return results
}

func isSameResourceDifferentScope(userPath, adminPath string) bool {
	userNorm := strings.ReplaceAll(strings.ToLower(userPath), "/admin/", "/")
	adminNorm := strings.ReplaceAll(strings.ToLower(adminPath), "/admin/", "/")
	adminNorm = strings.ReplaceAll(adminNorm, "/admin", "")
	userNorm = stripVersionSegments(userNorm)
	adminNorm = stripVersionSegments(adminNorm)
	return userNorm == adminNorm
}

func stripVersionSegments(path string) string {
	parts := strings.Split(path, "/")
	var filtered []string
	for _, p := range parts {
		if p != "v1" && p != "v2" && p != "v3" {
			filtered = append(filtered, p)
		}
	}
	return strings.Join(filtered, "/")
}

func extractResourceName(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) >= 2 {
		// Return the last two significant segments
		var segs []string
		for _, p := range parts {
			if !isPlaceholder(p) && p != "api" && p != "v1" && p != "v2" {
				segs = append(segs, p)
			}
		}
		if len(segs) >= 1 {
			return strings.Join(segs, "/")
		}
	}
	return path
}

// Mass assignment: compare PUT/PATCH body fields vs corresponding GET response fields
func detectMassAssignment(ctx context.Context, groups []schema.RequestGroup) []schema.MassAssignmentCandidate {
	candidates := make([]schema.MassAssignmentCandidate, 0)

	// Index GET endpoints by path
	getEndpoints := make(map[string]string) // path → response schema
	for _, g := range groups {
		if g.Method == "GET" {
			pathOnly := extractPathOnly(g.NormalizedPath)
			getEndpoints[pathOnly] = g.ResponseBodySchema
		}
	}

	for _, g := range groups {
		select {
		case <-ctx.Done():
			return candidates
		default:
		}

		if g.Method != "PUT" && g.Method != "PATCH" {
			continue
		}

		reqFields := parseBodySchemaKeys(g.RequestBodySchema)
		if len(reqFields) == 0 {
			continue
		}

		pathOnly := extractPathOnly(g.NormalizedPath)
		// Match against the GET endpoint with the same path
		respSchema, found := getEndpoints[pathOnly]
		if !found {
			continue
		}

		respFields := parseBodySchemaKeys(respSchema)
		if len(respFields) == 0 {
			continue
		}

		hidden := make([]string, 0)
		for _, f := range reqFields {
			if !containsString(respFields, f) {
				hidden = append(hidden, f)
			}
		}

		if len(hidden) > 0 {
			candidates = append(candidates, schema.MassAssignmentCandidate{
				EndpointMethod: g.Method,
				EndpointPath:   g.NormalizedPath,
				HiddenFields:   hidden,
			})
		}
	}

	return candidates
}

func parseBodySchemaKeys(schema string) []string {
	if schema == "" || schema == "{empty}" || schema == "[]" {
		return nil
	}

	if strings.HasPrefix(schema, "[") && strings.HasSuffix(schema, "]") {
		inner := schema[1 : len(schema)-1]
		if strings.TrimSpace(inner) == "" {
			return nil
		}
		parts := strings.Split(inner, ",")
		keys := make([]string, 0, len(parts))
		for _, p := range parts {
			k := strings.TrimSpace(p)
			// Remove dotted prefixes for nested keys, only keep top-level
			if !strings.Contains(k, ".") {
				keys = append(keys, k)
			}
		}
		return keys
	}

	return nil
}

func containsString(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

type endpointParams struct {
	path   string
	params map[string]bool
}

// Existing param-name clustering (kept for backward compatibility)
func runParamClustering(ctx context.Context, groups []schema.RequestGroup) []schema.ClusterInfo {
	if len(groups) == 0 {
		return []schema.ClusterInfo{}
	}

	eps := make([]endpointParams, 0, len(groups))
	for _, g := range groups {
		params := make(map[string]bool)
		for k := range g.ParamTypes {
			params[k] = true
		}
		eps = append(eps, endpointParams{
			path:   g.NormalizedPath,
			params: params,
		})
	}

	visited := make([]bool, len(eps))
	var clusters []schema.ClusterInfo
	clusterID := 0

	for i := 0; i < len(eps); i++ {
		if visited[i] {
			continue
		}
		cluster := []int{i}
		visited[i] = true

		for j := i + 1; j < len(eps); j++ {
			if visited[j] {
				continue
			}
			select {
			case <-ctx.Done():
				return clusters
			default:
			}
			if jaccardSimilarity(eps[i].params, eps[j].params) >= 0.7 {
				cluster = append(cluster, j)
				visited[j] = true
			}
		}

		if len(cluster) > 1 {
			ci := buildClusterInfo(clusterID, eps, cluster)
			clusters = append(clusters, ci)
			clusterID++
		}
	}

	sort.Slice(clusters, func(i, j int) bool {
		return clusters[i].EndpointCount > clusters[j].EndpointCount
	})

	return clusters
}

func jaccardSimilarity(a, b map[string]bool) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 1.0
	}
	if len(a) == 0 || len(b) == 0 {
		return 0.0
	}
	intersection := 0
	for k := range a {
		if b[k] {
			intersection++
		}
	}
	union := len(a) + len(b) - intersection
	if union == 0 {
		return 1.0
	}
	return float64(intersection) / float64(union)
}

func buildClusterInfo(clusterID int, eps []endpointParams, indices []int) schema.ClusterInfo {
	var endpoints []string
	for _, idx := range indices {
		endpoints = append(endpoints, eps[idx].path)
	}

	shared := make([]string, 0)
	firstEps := eps[indices[0]]
	for p := range firstEps.params {
		sharedAll := true
		for _, idx := range indices[1:] {
			if !eps[idx].params[p] {
				sharedAll = false
				break
			}
		}
		if sharedAll {
			shared = append(shared, p)
		}
	}
	sort.Strings(shared)
	sort.Strings(endpoints)

	return schema.ClusterInfo{
		ClusterID:     clusterID,
		Endpoints:     endpoints,
		SharedParams:  shared,
		EndpointCount: len(endpoints),
	}
}


