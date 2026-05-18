package schema

type RawRequest struct {
	ID              string            `json:"id"`
	Timestamp       int64             `json:"timestamp"`
	Method          string            `json:"method"`
	URL             string            `json:"url"`
	RequestHeaders  map[string]string `json:"request_headers"`
	RequestBody     string            `json:"request_body"`
	ResponseStatus  int               `json:"response_status"`
	ResponseHeaders map[string]string `json:"response_headers"`
	ResponseBody    string            `json:"response_body"`
	ContentType     string            `json:"content_type"`
	Duration        int64             `json:"duration"`
}
