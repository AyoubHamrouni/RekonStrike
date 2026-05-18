package main

import (
	"fmt"
	"os"
	"time"

	"rekonstrike/filter/schema"
)

func debugf(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
}

func RunPipeline(reqs []schema.RawRequest, debug bool) schema.SurfaceCapture {
	if debug {
		debugf("pipeline: starting with %d raw requests", len(reqs))
	}

	start := time.Now()

	s1 := runStage1(reqs, debug)
	groups := s1.groups
	filterStats := s1.stats

	extractorResult := runStage2(groups, debug)

	result := runStage3(groups, extractorResult, reqs, filterStats, debug)

	result.FilterStats.ProcessingTimeMs = time.Since(start).Milliseconds()

	if debug {
		debugf("pipeline: complete — %d unique endpoints, %d anomalies",
			result.UniqueEndpoints, countAnomalies(result))
	}

	return result
}

func countAnomalies(sc schema.SurfaceCapture) int {
	return len(sc.Anomalies)
}
