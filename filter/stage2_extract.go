package main

import (
	"context"
	"sync"
	"time"

	"rekonstrike/filter/extractors"
	"rekonstrike/filter/schema"
)

type ExtractorResult struct {
	EntropyClassifications []schema.EntropyClassification
	Deltas                []schema.Finding
	SchemaStability       []schema.SchemaStabilityFinding
	SequenceGraph         []schema.SequenceGraphEdge
	SequenceAnnotations   []schema.SequenceAnnotation
	Clusters              []schema.ClusterInfo
	SharedIDParams        []schema.SharedIDParameter
	PrivEscalations       []schema.PrivilegeEscalationSurface
	MassAssignments       []schema.MassAssignmentCandidate
	AuthMuts              []schema.AuthMutationSummary
}

func derefGroups(groups []*schema.RequestGroup) []schema.RequestGroup {
	out := make([]schema.RequestGroup, len(groups))
	for i, g := range groups {
		if g != nil {
			out[i] = *g
		}
	}
	return out
}

func runStage2(groups []*schema.RequestGroup, debug bool) ExtractorResult {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	groupsVal := derefGroups(groups)
	var result ExtractorResult
	var mu sync.Mutex
	var wg sync.WaitGroup

	start := time.Now()

	wg.Add(1)
	go func() {
		defer wg.Done()
		r := extractors.RunEntropyExtractor(ctx, groupsVal)
		select {
		case <-ctx.Done():
			return
		default:
			mu.Lock()
			result.EntropyClassifications = r
			mu.Unlock()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		findings, stability := extractors.RunDeltaExtractor(ctx, groupsVal)
		select {
		case <-ctx.Done():
			return
		default:
			mu.Lock()
			result.Deltas = findings
			result.SchemaStability = stability
			mu.Unlock()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		edges, annotations := extractors.RunSequenceExtractor(ctx, groupsVal)
		select {
		case <-ctx.Done():
			return
		default:
			mu.Lock()
			result.SequenceGraph = edges
			result.SequenceAnnotations = annotations
			mu.Unlock()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		clusters, sharedIDs, privEscs, massAssigns := extractors.RunClusteringExtractor(ctx, groupsVal)
		select {
		case <-ctx.Done():
			return
		default:
			mu.Lock()
			result.Clusters = clusters
			result.SharedIDParams = sharedIDs
			result.PrivEscalations = privEscs
			result.MassAssignments = massAssigns
			mu.Unlock()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		r := extractors.RunAuthExtractor(ctx, groupsVal)
		select {
		case <-ctx.Done():
			return
		default:
			mu.Lock()
			result.AuthMuts = r
			mu.Unlock()
		}
	}()

	wg.Wait()

	if debug {
		debugf("stage2: all extractors complete in %v", time.Since(start).Round(time.Millisecond))
		debugf("stage2: %d entropy, %d delta findings, %d stability, %d graph edges, %d seq annotations",
			len(result.EntropyClassifications), len(result.Deltas), len(result.SchemaStability),
			len(result.SequenceGraph), len(result.SequenceAnnotations))
		debugf("stage2: %d clusters, %d shared IDs, %d priv escalations, %d mass assignments, %d auth muts",
			len(result.Clusters), len(result.SharedIDParams), len(result.PrivEscalations),
			len(result.MassAssignments), len(result.AuthMuts))
	}

	return result
}
