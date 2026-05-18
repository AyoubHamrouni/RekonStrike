package extractors

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"sort"
	"strings"

	"rekonstrike/filter/schema"
)

var authCookieNames = []string{"sessionid", "session", "auth", "token", "jwt", "connect.sid", "sid", "remember"}

type authTimelineEntry struct {
	req       *schema.RawRequest
	label     string
	jwtClaims map[string]interface{}
	sessionID string
	csrfToken string
	hasAuth   bool
	rawAuth   string
}

func RunAuthExtractor(ctx context.Context, groups []schema.RequestGroup) []schema.AuthMutationSummary {
	var timeline []authTimelineEntry

	for _, g := range groups {
		for _, s := range g.AllSamples {
			entry := authTimelineEntry{
				req:     s,
				label:   g.Method + " " + g.NormalizedPath,
				hasAuth: false,
			}

			// Extract Authorization header
			for k, v := range s.RequestHeaders {
				lk := strings.ToLower(k)
				if lk == "authorization" {
					entry.rawAuth = v
					entry.hasAuth = true
				}
				if lk == "x-auth-token" || lk == "x-api-key" {
					entry.rawAuth = v
					entry.hasAuth = true
				}
				if lk == "x-csrf-token" || lk == "x-xsrf-token" || lk == "csrf-token" {
					entry.csrfToken = v
				}
			}

			// Decode JWT payload from Authorization header
			if entry.rawAuth != "" {
				lower := strings.ToLower(entry.rawAuth)
				for _, prefix := range []string{"bearer ", "token "} {
					if strings.HasPrefix(lower, prefix) {
						token := strings.TrimSpace(entry.rawAuth[len(prefix):])
						entry.jwtClaims = decodeJWTPayload(token)
						break
					}
				}
			}

			// Extract session ID from Cookie
			if cookie, ok := s.RequestHeaders["Cookie"]; ok {
				entry.sessionID = extractSessionID(cookie)
			}
			if cookie, ok := s.RequestHeaders["cookie"]; ok {
				entry.sessionID = extractSessionID(cookie)
			}

			timeline = append(timeline, entry)
		}
	}

	// Sort by timestamp
	sort.Slice(timeline, func(i, j int) bool {
		return timeline[i].req.Timestamp < timeline[j].req.Timestamp
	})

	var results []schema.AuthMutationSummary

	// Phase 2: Change detection across timeline
	results = append(results, detectJWTChanges(ctx, timeline)...)
	results = append(results, detectSessionFixation(ctx, timeline)...)
	results = append(results, detectCSRFWeakness(ctx, timeline)...)
	results = append(results, detectInconsistentAuth(ctx, timeline)...)

	return results
}

func decodeJWTPayload(token string) map[string]interface{} {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return nil
	}
	payload := parts[1]

	// Try standard base64 URL-safe decoding
	decoded, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		// Try with padding
		switch len(payload) % 4 {
		case 2:
			payload += "=="
		case 3:
			payload += "="
		}
		decoded, err = base64.URLEncoding.DecodeString(payload)
		if err != nil {
			// Try standard base64
			decoded, err = base64.StdEncoding.DecodeString(payload)
			if err != nil {
				return nil
			}
		}
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return nil
	}
	return claims
}

func extractSessionID(cookie string) string {
	if cookie == "" {
		return ""
	}
	lower := strings.ToLower(cookie)
	for _, name := range authCookieNames {
		idx := strings.Index(lower, name+"=")
		if idx >= 0 {
			start := idx + len(name) + 1
			end := strings.IndexByte(cookie[start:], ';')
			if end < 0 {
				return cookie[start:]
			}
			return cookie[start : start+end]
		}
	}
	return cookie // return full cookie if no named auth cookie found
}

func detectJWTChanges(ctx context.Context, timeline []authTimelineEntry) []schema.AuthMutationSummary {
	var results []schema.AuthMutationSummary
	prevClaims := make(map[string]interface{})
	prevLabel := ""

	for i, entry := range timeline {
		select {
		case <-ctx.Done():
			return results
		default:
		}

		if entry.jwtClaims == nil {
			continue
		}

		if len(prevClaims) > 0 {
			diffs := diffClaims(prevClaims, entry.jwtClaims)
			if len(diffs) > 0 {
				// Find the trigger endpoint — request immediately before this one
				triggerID := ""
				if i > 0 {
					triggerID = timeline[i-1].req.ID
				}

				// Check if role/scope/permissions changed
				changedClaims := make(map[string]string)
				isPrivChange := false
				for k, v := range diffs {
					changedClaims[k] = v
					kl := strings.ToLower(k)
					if kl == "role" || kl == "roles" || kl == "scope" || kl == "scopes" || kl == "permissions" || kl == "perm" {
						isPrivChange = true
					}
				}

				patternType := "TOKEN_CHANGE"
				detail := "JWT claims changed"
				if isPrivChange {
					patternType = "PRIVILEGE_CHANGE"
					detail = "Privilege-related claims changed (role/scope/permissions)"
				}

				results = append(results, schema.AuthMutationSummary{
					PatternType:    patternType,
					EndpointMethod: entry.req.Method,
					EndpointPath:   entry.label,
					Detail:         detail,
					ChangedClaims:  changedClaims,
					TriggerRequest: triggerID,
					TokensObserved: 2,
					RequestIDs:     []string{prevLabel, entry.req.ID},
				})
			}
		}

		prevClaims = entry.jwtClaims
		prevLabel = entry.req.ID
	}

	return results
}

func diffClaims(prev, curr map[string]interface{}) map[string]string {
	diffs := make(map[string]string)
	for k, cv := range curr {
		pv, exists := prev[k]
		if !exists {
			diffs[k] = "(new) " + fmtValue(cv)
		} else {
			pStr := fmtValue(pv)
			cStr := fmtValue(cv)
			if pStr != cStr {
				diffs[k] = pStr + " → " + cStr
			}
		}
	}
	for k, pv := range prev {
		if _, exists := curr[k]; !exists {
			diffs[k] = fmtValue(pv) + " → (removed)"
		}
	}
	return diffs
}

func fmtValue(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "<unprintable>"
	}
	return string(b)
}

func detectSessionFixation(ctx context.Context, timeline []authTimelineEntry) []schema.AuthMutationSummary {
	var results []schema.AuthMutationSummary
	prevSession := ""
	prevReqID := ""

	for i, entry := range timeline {
		select {
		case <-ctx.Done():
			return results
		default:
		}

		if entry.sessionID == "" {
			continue
		}

		if prevSession != "" && entry.sessionID != prevSession {
			// Check if a login/logout endpoint was called between
			hadAuthTransition := false
			for j := i - 1; j >= 0 && j > i-5; j-- {
				lowerLabel := strings.ToLower(timeline[j].label)
				if strings.Contains(lowerLabel, "login") || strings.Contains(lowerLabel, "logout") ||
					strings.Contains(lowerLabel, "/auth") || strings.Contains(lowerLabel, "/signin") {
					hadAuthTransition = true
					break
				}
			}
			if !hadAuthTransition {
				results = append(results, schema.AuthMutationSummary{
					PatternType:    "SESSION_FIXATION",
					EndpointMethod: entry.req.Method,
					EndpointPath:   entry.label,
					Detail:         "Session cookie changed without an intervening auth endpoint — potential session fixation",
					RequestIDs:     []string{prevReqID, entry.req.ID},
				})
			}
		}

		prevSession = entry.sessionID
		prevReqID = entry.req.ID
	}

	return results
}

func detectCSRFWeakness(ctx context.Context, timeline []authTimelineEntry) []schema.AuthMutationSummary {
	var results []schema.AuthMutationSummary
	prevCSRF := ""
	prevReqID := ""
	stateChangeMethods := map[string]bool{"POST": true, "PUT": true, "PATCH": true, "DELETE": true}

	for _, entry := range timeline {
		select {
		case <-ctx.Done():
			return results
		default:
		}

		if entry.csrfToken == "" {
			prevCSRF = ""
			continue
		}

		if stateChangeMethods[entry.req.Method] && prevCSRF != "" && entry.csrfToken == prevCSRF {
			results = append(results, schema.AuthMutationSummary{
				PatternType:    "CSRF_WEAKNESS",
				EndpointMethod: entry.req.Method,
				EndpointPath:   entry.label,
				Detail:         "CSRF token was not rotated between state-changing requests",
				RequestIDs:     []string{prevReqID, entry.req.ID},
			})
		}

		prevCSRF = entry.csrfToken
		prevReqID = entry.req.ID
	}

	return results
}

func detectInconsistentAuth(ctx context.Context, timeline []authTimelineEntry) []schema.AuthMutationSummary {
	var results []schema.AuthMutationSummary

	// Group by endpoint label
	type epAuthInfo struct {
		authedIDs   []string
		unauthIDs   []string
		unauthOKIDs []string
		method      string
		path        string
	}
	epMap := make(map[string]*epAuthInfo)

	for _, entry := range timeline {
		if epMap[entry.label] == nil {
			epMap[entry.label] = &epAuthInfo{method: entry.req.Method, path: entry.label}
		}
		info := epMap[entry.label]
		if entry.hasAuth {
			info.authedIDs = append(info.authedIDs, entry.req.ID)
		} else {
			info.unauthIDs = append(info.unauthIDs, entry.req.ID)
			if entry.req.ResponseStatus != 401 && entry.req.ResponseStatus != 403 {
				info.unauthOKIDs = append(info.unauthOKIDs, entry.req.ID)
			}
		}
	}

	for label, info := range epMap {
		select {
		case <-ctx.Done():
			return results
		default:
		}

		if len(info.authedIDs) > 0 && len(info.unauthOKIDs) > 0 {
			results = append(results, schema.AuthMutationSummary{
				PatternType:    "INCONSISTENT_AUTH",
				EndpointMethod: info.method,
				EndpointPath:   label,
				Detail:         "Some requests to this endpoint lacked auth headers but received non-401/403 responses",
				TokensObserved: len(info.authedIDs),
				RequestIDs:     info.unauthOKIDs,
			})
		}
	}

	return results
}
