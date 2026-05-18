package extractors

import (
	"context"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"rekonstrike/filter/schema"
)

func entropyOfDistribution(freq map[string]int, total int) float64 {
	if total == 0 {
		return 0
	}
	var h float64
	for _, count := range freq {
		p := float64(count) / float64(total)
		h -= p * math.Log2(p)
	}
	return h
}

func classifyParam(freq map[string]int, total int, paramType string, isPath bool) (string, float64, string, string) {
	if total == 0 {
		return "CONSTANT", 0, "", ""
	}

	maxCount := 0
	for _, c := range freq {
		if c > maxCount {
			maxCount = c
		}
	}
	maxRatio := float64(maxCount) / float64(total)
	uniqueRatio := float64(len(freq)) / float64(total)

	h := entropyOfDistribution(freq, total)

	var classification string
	if maxRatio > 0.8 || h == 0 {
		classification = "CONSTANT"
	} else if uniqueRatio >= 0.8 {
		classification = "HIGH_ENTROPY"
	} else if len(freq) <= 2 {
		classification = "ENUM"
	} else if len(freq) <= 4 && total >= 3*len(freq) {
		classification = "ENUM"
	} else if h <= 3.0 {
		classification = "LOW_ENTROPY"
	} else if h <= 5.0 {
		classification = "MEDIUM_ENTROPY"
	} else {
		classification = "HIGH_ENTROPY"
	}

	anomalyType := ""
	anomalyDetail := ""

	if classification == "CONSTANT" && len(freq) == 1 {
		for val := range freq {
			e := perCharEntropy(val)
			if e > 4.0 {
				anomalyType = "CONSTANT_BYPASS_ATTEMPT"
				anomalyDetail = "Constant parameter with high-entropy value — possible bypass token"
			}
			break
		}
	}

	if classification == "ENUM" {
		if paramType == "{int}" && isPath {
			anomalyType = "IDOR_CANDIDATE"
			anomalyDetail = "Integer path parameter with few values — likely enumerable"
		} else {
			anomalyType = "ENUM_VALUES"
			anomalyDetail = "Parameter accepts a small fixed set of values"
		}
	}

	if classification == "LOW_ENTROPY" && paramType == "{int}" && isPath {
		anomalyType = "IDOR_CANDIDATE"
		anomalyDetail = "Integer path parameter with low entropy — likely enumerable"
	}

	if classification == "HIGH_ENTROPY" && isPath {
		anomalyType = "TOKEN_IN_PATH"
		anomalyDetail = "High-entropy token in URL path — check predictability"
	}

	return classification, h, anomalyType, anomalyDetail
}

func perCharEntropy(s string) float64 {
	if s == "" {
		return 0
	}
	freq := make(map[rune]int)
	for _, ch := range s {
		freq[ch]++
	}
	var entropy float64
	runes := []rune(s)
	length := float64(len(runes))
	for _, count := range freq {
		p := float64(count) / length
		entropy -= p * math.Log2(p)
	}
	return entropy
}

func paramKey(endpointMethod, endpointPath, location, name string) string {
	return endpointMethod + " " + endpointPath + ":" + location + ":" + name
}

func RunEntropyExtractor(ctx context.Context, groups []schema.RequestGroup) []schema.EntropyClassification {
	results := make([]schema.EntropyClassification, 0)

	countsByParam := make(map[string]map[string]int)
	typeByParam := make(map[string]string)
	isPathByParam := make(map[string]bool)
	epMethodByParam := make(map[string]string)
	epPathByParam := make(map[string]string)
	locByParam := make(map[string]string)

	for _, g := range groups {
		select {
		case <-ctx.Done():
			return results
		default:
		}

		for _, s := range g.AllSamples {
			u, err := url.Parse(s.URL)
			if err != nil {
				continue
			}

			normPathOnly := extractPathOnly(g.NormalizedPath)
			normParts := strings.Split(normPathOnly, "/")
			actualParts := strings.Split(u.Path, "/")

			for i, seg := range normParts {
				if isPlaceholder(seg) {
					if i < len(actualParts) {
						val := actualParts[i]
						key := paramKey(g.Method, normPathOnly, "path", seg+"["+strconv.Itoa(i)+"]")
						if countsByParam[key] == nil {
							countsByParam[key] = make(map[string]int)
							typeByParam[key] = seg
							isPathByParam[key] = true
							epMethodByParam[key] = g.Method
							epPathByParam[key] = g.NormalizedPath
							locByParam[key] = "path"
						}
						countsByParam[key][val]++
					}
				}
			}

			for name, vals := range u.Query() {
				if len(vals) == 0 {
					continue
				}
				val := vals[0]
				key := paramKey(g.Method, normPathOnly, "query", name)
				if countsByParam[key] == nil {
					countsByParam[key] = make(map[string]int)
					typeByParam[key] = g.ParamTypes[name]
					isPathByParam[key] = false
					epMethodByParam[key] = g.Method
					epPathByParam[key] = g.NormalizedPath
					locByParam[key] = "query"
				}
				countsByParam[key][val]++
			}
		}
	}

	for key, freq := range countsByParam {
		select {
		case <-ctx.Done():
			return results
		default:
		}

		total := 0
		for _, c := range freq {
			total += c
		}

		classification, h, anomalyType, anomalyDetail := classifyParam(freq, total, typeByParam[key], isPathByParam[key])

		sampleVals := make([]string, 0, len(freq))
		for v := range freq {
			sampleVals = append(sampleVals, v)
		}
		sort.Strings(sampleVals)

		if len(sampleVals) > 10 {
			sampleVals = sampleVals[:10]
		}

		locByParam[key] = locByParam[key]

		results = append(results, schema.EntropyClassification{
			ParamName:      key,
			Location:       locByParam[key],
			Classification: classification,
			ShannonH:       math.Round(h*100) / 100,
			UniqueValues:   len(freq),
			SampleValues:   sampleVals,
			EndpointMethod: epMethodByParam[key],
			EndpointPath:   epPathByParam[key],
			AnomalyType:    anomalyType,
			AnomalyDetail:  anomalyDetail,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].ShannonH > results[j].ShannonH
	})

	return results
}
