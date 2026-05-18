package extractors

import "strings"

func extractPathOnly(normalizedPath string) string {
	parts := strings.SplitN(normalizedPath, " ", 2)
	if len(parts) == 2 {
		queryIdx := strings.Index(parts[1], "?")
		if queryIdx >= 0 {
			return parts[1][:queryIdx]
		}
		return parts[1]
	}
	return normalizedPath
}

func isPlaceholder(seg string) bool {
	return seg == "{int}" || seg == "{uuid}" || seg == "{email}" || seg == "{token}" || seg == "{float}" || seg == "{long_string}" || seg == "{enum}" || seg == "{empty}" || seg == "{mixed}"
}
