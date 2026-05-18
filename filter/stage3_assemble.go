package main

import (
	"net/url"
	"sort"
	"strings"

	"rekonstrike/filter/schema"
)

func runStage3(
	groups []*schema.RequestGroup,
	extResult ExtractorResult,
	allReqs []schema.RawRequest,
	stats schema.FilterStats,
	debug bool,
) schema.SurfaceCapture {
	target := extractTargetFromReqs(allReqs)
	result := schema.NewSurfaceCapture(target)

	result.RequestCount = len(allReqs)
	result.FilterStats = stats

	result.ResourceFamilies = buildResourceFamilies(groups, extResult)
	result.UniqueEndpoints = countEndpoints(result.ResourceFamilies)

	result.Sequences = buildSequences(extResult)

	result.Anomalies = buildAnomalies(extResult)

	result.SessionContext = buildSessionContext(extResult)

	sort.Slice(result.Anomalies, func(i, j int) bool {
		si := severityRank(result.Anomalies[i].Severity)
		sj := severityRank(result.Anomalies[j].Severity)
		if si != sj {
			return si < sj
		}
		return result.Anomalies[i].Type < result.Anomalies[j].Type
	})

	if debug {
		debugf("stage3: assembled %d families, %d endpoints, %d anomalies, %d sequences",
			len(result.ResourceFamilies), result.UniqueEndpoints,
			len(result.Anomalies), len(result.Sequences))
	}

	return result
}

func extractTargetFromReqs(reqs []schema.RawRequest) string {
	for _, r := range reqs {
		u, err := url.Parse(r.URL)
		if err == nil && u.Host != "" {
			return u.Host
		}
	}
	return ""
}

func countEndpoints(families []schema.ResourceFamily) int {
	n := 0
	for _, f := range families {
		n += len(f.Endpoints)
	}
	return n
}

func buildResourceFamilies(groups []*schema.RequestGroup, extResult ExtractorResult) []schema.ResourceFamily {
	type familyEntry struct {
		familyID string
		basePath string
		eps      []schema.Endpoint
	}
	familyMap := make(map[string]*familyEntry)
	familyOrder := make([]string, 0)

	for _, g := range groups {
		ep := buildEndpoint(g, extResult)

		basePath := extractBasePath(ep.NormalizedPath)
		familyID := basePath
		if familyID == "" {
			familyID = "/"
		}

		if _, exists := familyMap[familyID]; !exists {
			familyMap[familyID] = &familyEntry{
				familyID: familyID,
				basePath: basePath,
				eps:      make([]schema.Endpoint, 0),
			}
			familyOrder = append(familyOrder, familyID)
		}
		familyMap[familyID].eps = append(familyMap[familyID].eps, ep)
	}

	families := make([]schema.ResourceFamily, 0, len(familyOrder))
	for _, id := range familyOrder {
		fe := familyMap[id]
		families = append(families, schema.ResourceFamily{
			FamilyID:  fe.familyID,
			BasePath:  fe.basePath,
			Endpoints: fe.eps,
		})
	}

	return families
}

func extractBasePath(normalizedPath string) string {
	parts := strings.SplitN(normalizedPath, " ", 2)
	if len(parts) != 2 {
		return normalizedPath
	}
	pathOnly := parts[1]
	segments := strings.Split(strings.Trim(pathOnly, "/"), "/")
	if len(segments) == 0 {
		return "/"
	}
	if len(segments) == 1 {
		return "/" + segments[0]
	}
	return "/" + segments[0] + "/" + segments[1]
}

func buildEndpoint(g *schema.RequestGroup, extResult ExtractorResult) schema.Endpoint {
	ep := schema.Endpoint{
		Method:             g.Method,
		NormalizedPath:     g.NormalizedPath,
		ObservedCount:      g.ObservedCount,
		RequestBodySchema:  g.RequestBodySchema,
		ResponseBodySchema: g.ResponseBodySchema,
		AuthRequired:       g.MultiAuth,
		ResponseCodes:      g.StatusCodes,
		PathParameters:     make([]schema.ParameterDef, 0),
		QueryParameters:    make([]schema.ParameterDef, 0),
		LeakedFields:       make([]string, 0),
	}

	paramDefs := buildParamDefs(g, extResult.EntropyClassifications)
	ep.PathParameters = paramDefs.path
	ep.QueryParameters = paramDefs.query

	for _, stab := range extResult.SchemaStability {
		if stab.EndpointMethod == g.Method && stab.EndpointPath == g.NormalizedPath {
			if len(stab.LeakedFields) > 0 {
				ep.LeakedFields = stab.LeakedFields
			}
			break
		}
	}

	ep.Predecessors = findPredecessors(g.NormalizedPath, extResult.SequenceGraph, extResult.SequenceAnnotations)
	ep.Successors = findSuccessors(g.NormalizedPath, extResult.SequenceGraph, extResult.SequenceAnnotations)

	return ep
}

type paramDefs struct {
	path  []schema.ParameterDef
	query []schema.ParameterDef
}

func buildParamDefs(g *schema.RequestGroup, classifications []schema.EntropyClassification) paramDefs {
	var result paramDefs

	ecByKey := make(map[string]schema.EntropyClassification)
	for _, ec := range classifications {
		ecByKey[ec.ParamName] = ec
	}

	seen := make(map[string]bool)

	for name, inferredType := range g.ParamTypes {
		pos := "query"
		key := g.Method + " " + extractPathPortion(g.NormalizedPath) + ":query:" + name
		if _, ok := ecByKey[key]; !ok {
			for k := range ecByKey {
				if strings.HasSuffix(k, ":"+name) && strings.Contains(k, ":path:") {
					pos = "path"
					key = k
					break
				}
			}
		}

		ec, hasEC := ecByKey[key]
		pd := schema.ParameterDef{
			Name:         name,
			Position:     pos,
			InferredType: inferredType,
		}
		if hasEC {
			pd.Entropy = ec.ShannonH
			pd.EntropyClass = ec.Classification
			if len(ec.SampleValues) > 0 && ec.Classification == "ENUM" {
				pd.EnumValues = ec.SampleValues
			}
		}
		pd.AppearsInResponse = checkFieldInResponse(name, g.ResponseBodySchema)

		seen[key] = true

		if pos == "path" {
			result.path = append(result.path, pd)
		} else {
			result.query = append(result.query, pd)
		}
	}

	// Also add path params from entropy classifications for this endpoint
	for _, ec := range classifications {
		if ec.Location != "path" {
			continue
		}
		if ec.EndpointMethod != g.Method || ec.EndpointPath != g.NormalizedPath {
			continue
		}
		if seen[ec.ParamName] {
			continue
		}
		seen[ec.ParamName] = true
		parts := strings.Split(ec.ParamName, ":")
		pName := parts[len(parts)-1]
		pType := ec.ParamName
		for _, prefix := range []string{"{int}", "{uuid}", "{token}", "{enum}", "{float}", "{long_string}", "{email}"} {
			if strings.Contains(ec.ParamName, prefix) {
				pType = prefix
				break
			}
		}
		pd := schema.ParameterDef{
			Name:         pName,
			Position:     "path",
			InferredType: pType,
			Entropy:      ec.ShannonH,
			EntropyClass: ec.Classification,
		}
		if len(ec.SampleValues) > 0 && ec.Classification == "ENUM" {
			pd.EnumValues = ec.SampleValues
		}
		pd.AppearsInResponse = checkFieldInResponse(pName, g.ResponseBodySchema)
		result.path = append(result.path, pd)
	}

	sort.Slice(result.path, func(i, j int) bool {
		return result.path[i].Name < result.path[j].Name
	})
	sort.Slice(result.query, func(i, j int) bool {
		return result.query[i].Name < result.query[j].Name
	})

	return result
}

func extractPathPortion(normalizedPath string) string {
	parts := strings.SplitN(normalizedPath, " ", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return normalizedPath
}

func checkFieldInResponse(name string, responseSchema string) bool {
	if responseSchema == "" || responseSchema == "{empty}" {
		return false
	}
	body := strings.ToLower(responseSchema)
	return strings.Contains(body, strings.ToLower(name))
}

func findPredecessors(normalizedPath string, edges []schema.SequenceGraphEdge, annotations []schema.SequenceAnnotation) []string {
	seen := make(map[string]bool)
	var result []string

	for _, a := range annotations {
		if a.PatternType == "REQUIRED_SEQUENCE" && len(a.Endpoints) >= 2 {
			if a.Endpoints[1] == normalizedPath {
				pred := a.Endpoints[0]
				if !seen[pred] {
					seen[pred] = true
					result = append(result, pred)
				}
			}
		}
	}

	for _, e := range edges {
		if e.ToEndpoint == normalizedPath {
			if !seen[e.FromEndpoint] {
				seen[e.FromEndpoint] = true
				result = append(result, e.FromEndpoint)
			}
		}
	}

	return result
}

func findSuccessors(normalizedPath string, edges []schema.SequenceGraphEdge, annotations []schema.SequenceAnnotation) []string {
	seen := make(map[string]bool)
	var result []string

	for _, a := range annotations {
		if a.PatternType == "REQUIRED_SEQUENCE" && len(a.Endpoints) >= 2 {
			if a.Endpoints[0] == normalizedPath {
				succ := a.Endpoints[1]
				if !seen[succ] {
					seen[succ] = true
					result = append(result, succ)
				}
			}
		}
	}

	for _, e := range edges {
		if e.FromEndpoint == normalizedPath {
			if !seen[e.ToEndpoint] {
				seen[e.ToEndpoint] = true
				result = append(result, e.ToEndpoint)
			}
		}
	}

	return result
}

func buildSequences(extResult ExtractorResult) []schema.SequenceEdge {
	seen := make(map[string]bool)
	var edges []schema.SequenceEdge

	required := make(map[string]bool)
	for _, a := range extResult.SequenceAnnotations {
		if a.PatternType == "REQUIRED_SEQUENCE" && len(a.Endpoints) >= 2 {
			key := a.Endpoints[0] + "->" + a.Endpoints[1]
			required[key] = true
		}
	}

	for _, e := range extResult.SequenceGraph {
		key := e.FromEndpoint + "->" + e.ToEndpoint
		if seen[key] {
			continue
		}
		seen[key] = true
		prob := e.Weight
		if prob > 1.0 {
			prob = 1.0
		}
		edges = append(edges, schema.SequenceEdge{
			From:        e.FromEndpoint,
			To:          e.ToEndpoint,
			Probability: prob,
			IsRequired:  required[key],
		})
	}

	sort.Slice(edges, func(i, j int) bool {
		return edges[i].Probability > edges[j].Probability
	})

	return edges
}

func buildAnomalies(extResult ExtractorResult) []schema.Anomaly {
	var anomalies []schema.Anomaly

	seen := make(map[string]bool)
	addUnique := func(a schema.Anomaly) {
		key := a.Type + "|" + a.Endpoint
		if !seen[key] {
			seen[key] = true
			anomalies = append(anomalies, a)
		}
	}

	for _, f := range extResult.Deltas {
		addUnique(schema.Anomaly{
			Type:     mapDeltaType(f.Type),
			Severity: mapSeverity(f.Severity),
			Endpoint: f.EndpointPath,
			Evidence: f.Detail,
			TestHint: anomalyTestHint(mapDeltaType(f.Type)),
		})
	}

	for _, ec := range extResult.EntropyClassifications {
		if ec.AnomalyType == "" {
			continue
		}
		anomalyType := mapEntropyAnomalyType(ec.AnomalyType)
		ep := ec.EndpointMethod + " " + ec.EndpointPath
		addUnique(schema.Anomaly{
			Type:     anomalyType,
			Severity: entropyAnomalySeverity(anomalyType),
			Endpoint: ep,
			Evidence: ec.AnomalyDetail,
			TestHint: anomalyTestHint(anomalyType),
		})
	}

	for _, pe := range extResult.PrivEscalations {
		addUnique(schema.Anomaly{
			Type:     "PRIVILEGE_ESCALATION_SURFACE",
			Severity: "High",
			Endpoint: pe.UserScopedPath + " / " + pe.AdminScopedPath,
			Evidence: "User-scoped endpoint " + pe.UserScopedPath + " has admin equivalent at " + pe.AdminScopedPath,
			TestHint: anomalyTestHint("PRIVILEGE_ESCALATION_SURFACE"),
		})
	}

	for _, ma := range extResult.MassAssignments {
		ep := ma.EndpointMethod + " " + ma.EndpointPath
		evidence := "PUT/PATCH body includes fields not in GET response: " + strings.Join(ma.HiddenFields, ", ")
		addUnique(schema.Anomaly{
			Type:     "MASS_ASSIGNMENT_CANDIDATE",
			Severity: "High",
			Endpoint: ep,
			Evidence: evidence,
			TestHint: anomalyTestHint("MASS_ASSIGNMENT_CANDIDATE"),
		})
	}

	for _, si := range extResult.SharedIDParams {
		if len(si.Endpoints) >= 2 {
			evidence := si.Endpoints[0] + " and " + si.Endpoints[1] + " share " + si.ParameterName + " values"
			addUnique(schema.Anomaly{
				Type:     "SHARED_ID_PARAMETER",
				Severity: "Medium",
				Endpoint: si.Endpoints[0],
				Evidence: evidence,
				TestHint: anomalyTestHint("SHARED_ID_PARAMETER"),
			})
		}
	}

	for _, am := range extResult.AuthMuts {
		anomalyType := mapAuthMutationType(am.PatternType)
		ep := am.EndpointMethod + " " + am.EndpointPath
		evidence := am.Detail
		if evidence == "" {
			evidence = anomalyType
		}
		addUnique(schema.Anomaly{
			Type:     anomalyType,
			Severity: authAnomalySeverity(anomalyType),
			Endpoint: ep,
			Evidence: evidence,
			TestHint: anomalyTestHint(anomalyType),
		})
	}

	return anomalies
}

func mapDeltaType(t string) string {
	switch t {
	case "conditional_schema":
		return "CONDITIONAL_SCHEMA"
	case "leaked_fields":
		return "LEAKED_FIELDS"
	case "dead_parameter":
		return "DEAD_PARAMETER"
	case "multi_auth":
		return "INCONSISTENT_AUTH_ENFORCEMENT"
	default:
		return strings.ToUpper(t)
	}
}

func mapEntropyAnomalyType(t string) string {
	switch t {
	case "CONSTANT_BYPASS_ATTEMPT":
		return "CONSTANT_BYPASS_ATTEMPT"
	case "IDOR_CANDIDATE":
		return "IDOR_CANDIDATE"
	case "TOKEN_IN_PATH":
		return "TOKEN_IN_PATH"
	case "ENUM_VALUES":
		return "ENUM_VALUES"
	default:
		return t
	}
}

func mapAuthMutationType(t string) string {
	switch t {
	case "PRIVILEGE_CHANGE":
		return "PRIVILEGE_CHANGE_DETECTED"
	case "SESSION_FIXATION":
		return "SESSION_FIXATION_CANDIDATE"
	case "CSRF_WEAKNESS":
		return "CSRF_WEAKNESS"
	case "INCONSISTENT_AUTH":
		return "INCONSISTENT_AUTH_ENFORCEMENT"
	default:
		return t
	}
}

func mapSeverity(s string) string {
	switch strings.ToLower(s) {
	case "critical":
		return "Critical"
	case "high":
		return "High"
	case "medium":
		return "Medium"
	case "low":
		return "Low"
	default:
		return "Medium"
	}
}

func entropyAnomalySeverity(t string) string {
	switch t {
	case "CONSTANT_BYPASS_ATTEMPT", "TOKEN_IN_PATH":
		return "High"
	case "IDOR_CANDIDATE":
		return "Critical"
	default:
		return "Low"
	}
}

func authAnomalySeverity(t string) string {
	switch t {
	case "PRIVILEGE_CHANGE_DETECTED":
		return "Critical"
	case "SESSION_FIXATION_CANDIDATE":
		return "High"
	case "CSRF_WEAKNESS":
		return "Medium"
	case "INCONSISTENT_AUTH_ENFORCEMENT":
		return "High"
	default:
		return "Medium"
	}
}

func severityRank(s string) int {
	switch s {
	case "Critical":
		return 0
	case "High":
		return 1
	case "Medium":
		return 2
	case "Low":
		return 3
	default:
		return 4
	}
}

func anomalyTestHint(t string) string {
	switch t {
	case "IDOR_CANDIDATE":
		return "Try substituting your user ID into the {int} parameter of this endpoint"
	case "MASS_ASSIGNMENT_CANDIDATE":
		return "Try sending a PUT/PATCH request with the hidden fields to see if they are accepted"
	case "PRIVILEGE_ESCALATION_SURFACE":
		return "Try accessing the admin-scoped endpoint with a user-level session"
	case "SEQUENCE_BYPASS":
		return "Try accessing this endpoint directly without the required predecessor"
	case "SESSION_FIXATION_CANDIDATE":
		return "Check if the session ID can be set before authentication"
	case "CSRF_WEAKNESS":
		return "Check if requests succeed without a valid CSRF token"
	case "INCONSISTENT_AUTH_ENFORCEMENT":
		return "Try accessing this endpoint without authentication headers"
	case "DEAD_PARAMETER":
		return "Try removing this parameter to see if the response changes"
	case "TOKEN_IN_PATH":
		return "Check if this token can be reused across different sessions"
	case "LEAKED_FIELDS":
		return "Check if sensitive fields are exposed in the response"
	case "PRIVILEGE_CHANGE_DETECTED":
		return "Review the trigger endpoint that caused a privilege escalation"
	case "SHARED_ID_PARAMETER":
		return "Try accessing one endpoint with an ID from another endpoint"
	case "CONSTANT_BYPASS_ATTEMPT":
		return "Try modifying the constant parameter to bypass authentication"
	case "CONDITIONAL_SCHEMA":
		return "Check if response schema differs based on user roles or parameters"
	case "ENUM_VALUES":
		return "Try enumerating possible values for this parameter"
	default:
		return "Verify this finding manually"
	}
}

func buildSessionContext(extResult ExtractorResult) schema.SessionContext {
	sc := schema.SessionContext{
		AuthMechanisms:   make([]string, 0),
		RolesDetected:    make([]string, 0),
		PrivilegeChanges: make([]schema.PrivilegeChange, 0),
	}
	seenMech := make(map[string]bool)

	for _, am := range extResult.AuthMuts {
		switch am.PatternType {
		case "TOKEN_CHANGE", "PRIVILEGE_CHANGE":
			if !seenMech["jwt"] {
				sc.AuthMechanisms = append(sc.AuthMechanisms, "jwt")
				seenMech["jwt"] = true
			}
			if am.ChangedClaims != nil {
				for claimKey := range am.ChangedClaims {
					kl := strings.ToLower(claimKey)
					if kl == "role" || kl == "roles" || kl == "scope" || kl == "scopes" {
						sc.RolesDetected = append(sc.RolesDetected, am.ChangedClaims[claimKey])
					}
				}
			}
		}
	}

	for _, g := range extResult.AuthMuts {
		for _, rid := range g.RequestIDs {
			_ = rid
		}
	}

	sc.RolesDetected = uniqueStrings(sc.RolesDetected)
	sc.AuthMechanisms = uniqueStrings(sc.AuthMechanisms)

	if len(sc.AuthMechanisms) == 0 {
		sc.AuthMechanisms = []string{}
	}
	if len(sc.RolesDetected) == 0 {
		sc.RolesDetected = []string{}
	}

	return sc
}

func uniqueStrings(s []string) []string {
	seen := make(map[string]bool)
	var result []string
	for _, v := range s {
		if !seen[v] {
			seen[v] = true
			result = append(result, v)
		}
	}
	return result
}
