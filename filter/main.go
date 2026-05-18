package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"rekonstrike/filter/schema"
)

func extractTarget(reqs []schema.RawRequest) string {
	for _, r := range reqs {
		u, err := url.Parse(r.URL)
		if err == nil && u.Host != "" {
			return u.Host
		}
	}
	return ""
}

func main() {
	debug := flag.Bool("debug", false, "enable detailed debug output to stderr")
	flag.Parse()

	var reqs []schema.RawRequest
	dec := json.NewDecoder(os.Stdin)

	tok, err := dec.Token()
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to read JSON token:", err)
		os.Exit(1)
	}

	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		fmt.Fprintln(os.Stderr, "expected JSON array at root, got:", tok)
		os.Exit(1)
	}

	for dec.More() {
		var r schema.RawRequest
		if err := dec.Decode(&r); err != nil {
			fmt.Fprintln(os.Stderr, "failed to decode request:", err)
			os.Exit(1)
		}
		reqs = append(reqs, r)
	}

	_, err = dec.Token()
	if err != nil && err != io.EOF {
		fmt.Fprintln(os.Stderr, "warning: unexpected trailing data:", err)
	}

	if *debug {
		debugf("main: parsed %d requests from stdin", len(reqs))
	}

	target := extractTarget(reqs)

	if len(reqs) == 0 {
		result := schema.NewSurfaceCapture(target)
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(result); err != nil {
			fmt.Fprintln(os.Stderr, "failed to write output:", err)
			os.Exit(1)
		}
		return
	}

	result := RunPipeline(reqs, *debug)

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, "failed to write output:", err)
		os.Exit(1)
	}
}
