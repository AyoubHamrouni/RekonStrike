package schema

import "time"

type RequestGroup struct {
	NormalizedPath     string
	Method             string
	CanonicalRequest   *RawRequest
	AllSamples         []*RawRequest
	ObservedCount      int
	RequestBodySchema  string
	ResponseBodySchema string
	ParamTypes         map[string]string
	MultiAuth          bool
	StatusCodes        []int
}

type NormalizedEndpoint struct {
	Method              string            `json:"method"`
	NormalizedPath      string            `json:"normalized_path"`
	ObservedCount       int               `json:"observed_count"`
	CanonicalRequest    RawRequest        `json:"canonical_request"`
	RequestBodySchema   string            `json:"request_body_schema,omitempty"`
	ResponseBodySchema  string            `json:"response_body_schema,omitempty"`
	ParamTypes          map[string]string `json:"param_types,omitempty"`
	MultiAuth           bool              `json:"multi_auth"`
	StatusCodes         []int             `json:"status_codes"`
}

type Finding struct {
	Type           string `json:"type"`
	Severity       string `json:"severity"`
	EndpointMethod string `json:"endpoint_method"`
	EndpointPath   string `json:"endpoint_path"`
	Detail         string `json:"detail"`
	Evidence       string `json:"evidence,omitempty"`
}

type EntropyClassification struct {
	ParamName      string   `json:"param_name"`
	Location       string   `json:"location"`
	Classification string   `json:"classification"`
	ShannonH       float64  `json:"shannon_h"`
	UniqueValues   int      `json:"unique_values"`
	SampleValues   []string `json:"sample_values,omitempty"`
	EndpointMethod string   `json:"endpoint_method"`
	EndpointPath   string   `json:"endpoint_path"`
	AnomalyType    string   `json:"anomaly_type,omitempty"`
	AnomalyDetail  string   `json:"anomaly_detail,omitempty"`
}

type SchemaStabilityFinding struct {
	EndpointMethod  string   `json:"endpoint_method"`
	EndpointPath    string   `json:"endpoint_path"`
	Stability       string   `json:"stability"`
	ConditionalParam string  `json:"conditional_param,omitempty"`
	LeakedFields    []string `json:"leaked_fields,omitempty"`
	DeadParams      []string `json:"dead_params,omitempty"`
}

type SequenceGraphEdge struct {
	FromEndpoint string  `json:"from_endpoint"`
	ToEndpoint   string  `json:"to_endpoint"`
	Weight       float64 `json:"weight"`
	Observations int     `json:"observations"`
}

type SequenceAnnotation struct {
	PatternType    string   `json:"pattern_type"`
	Endpoints      []string `json:"endpoints"`
	SecuritySignal bool     `json:"security_signal"`
	Description    string   `json:"description"`
}

type ClusterInfo struct {
	ClusterID     int      `json:"cluster_id"`
	Endpoints     []string `json:"endpoints"`
	SharedParams  []string `json:"shared_params"`
	EndpointCount int      `json:"endpoint_count"`
}

type SharedIDParameter struct {
	ParameterName string   `json:"parameter_name"`
	Endpoints     []string `json:"endpoints"`
	ObservedValues []int   `json:"observed_values,omitempty"`
	OverlapCount  int      `json:"overlap_count"`
}

type PrivilegeEscalationSurface struct {
	ResourceName    string `json:"resource_name"`
	UserScopedPath  string `json:"user_scoped_path"`
	AdminScopedPath string `json:"admin_scoped_path"`
}

type MassAssignmentCandidate struct {
	EndpointMethod string   `json:"endpoint_method"`
	EndpointPath   string   `json:"endpoint_path"`
	HiddenFields   []string `json:"hidden_fields"`
}

type AuthMutationSummary struct {
	PatternType     string            `json:"pattern_type"`
	EndpointMethod  string            `json:"endpoint_method"`
	EndpointPath    string            `json:"endpoint_path"`
	Detail          string            `json:"detail,omitempty"`
	ChangedClaims   map[string]string `json:"changed_claims,omitempty"`
	TriggerRequest  string            `json:"trigger_request_id,omitempty"`
	TokensObserved  int               `json:"tokens_observed,omitempty"`
	RequestIDs      []string          `json:"request_ids,omitempty"`
}

type FilterStats struct {
	InputCount          int   `json:"input_count"`
	DroppedStaticAssets int   `json:"dropped_static_assets"`
	DroppedDuplicates   int   `json:"dropped_duplicates"`
	DroppedEmpty        int   `json:"dropped_empty"`
	OutputCount         int   `json:"output_count"`
	ProcessingTimeMs    int64 `json:"processing_time_ms"`
}

type ParameterDef struct {
	Name               string   `json:"name"`
	Position           string   `json:"position"`
	InferredType       string   `json:"inferred_type"`
	Entropy            float64  `json:"entropy"`
	EntropyClass       string   `json:"entropy_class"`
	EnumValues         []string `json:"enum_values,omitempty"`
	AppearsInResponse  bool     `json:"appears_in_response"`
}

type Endpoint struct {
	Method             string         `json:"method"`
	NormalizedPath     string         `json:"normalized_path"`
	ObservedCount      int            `json:"observed_count"`
	PathParameters     []ParameterDef `json:"path_parameters,omitempty"`
	QueryParameters    []ParameterDef `json:"query_parameters,omitempty"`
	RequestBodySchema  string         `json:"request_body_schema,omitempty"`
	ResponseBodySchema string         `json:"response_body_schema,omitempty"`
	LeakedFields       []string       `json:"leaked_fields,omitempty"`
	AuthRequired       bool           `json:"auth_required"`
	ResponseCodes      []int          `json:"response_codes"`
	Predecessors       []string       `json:"predecessors,omitempty"`
	Successors         []string       `json:"successors,omitempty"`
}

type PrivilegeChange struct {
	AtTimestamp      int64                  `json:"at_timestamp"`
	TriggerEndpoint  string                 `json:"trigger_endpoint"`
	ClaimsChanged    []string               `json:"claims_changed"`
	Before           map[string]interface{} `json:"before"`
	After            map[string]interface{} `json:"after"`
}

type SessionContext struct {
	AuthMechanisms   []string          `json:"auth_mechanisms"`
	RolesDetected    []string          `json:"roles_detected"`
	PrivilegeChanges []PrivilegeChange `json:"privilege_changes,omitempty"`
}

type ResourceFamily struct {
	FamilyID  string     `json:"family_id"`
	BasePath  string     `json:"base_path"`
	Endpoints []Endpoint `json:"endpoints"`
}

type SequenceEdge struct {
	From        string  `json:"from"`
	To          string  `json:"to"`
	Probability float64 `json:"probability"`
	IsRequired  bool    `json:"is_required"`
}

type Anomaly struct {
	Type      string `json:"type"`
	Severity  string `json:"severity"`
	Endpoint  string `json:"endpoint"`
	Evidence  string `json:"evidence"`
	TestHint  string `json:"test_hint"`
}

type SurfaceCapture struct {
	Target           string           `json:"target"`
	CapturedAt       string           `json:"captured_at"`
	RequestCount     int              `json:"request_count"`
	UniqueEndpoints  int              `json:"unique_endpoints"`
	SessionContext   SessionContext   `json:"session_context"`
	ResourceFamilies []ResourceFamily `json:"resource_families"`
	Sequences        []SequenceEdge   `json:"sequences"`
	Anomalies        []Anomaly        `json:"anomalies"`
	FilterStats      FilterStats      `json:"filter_stats"`
}

func NewSurfaceCapture(target string) SurfaceCapture {
	return SurfaceCapture{
		Target:     target,
		CapturedAt: time.Now().UTC().Format(time.RFC3339),
		SessionContext: SessionContext{
			AuthMechanisms: make([]string, 0),
			RolesDetected:  make([]string, 0),
		},
		ResourceFamilies: make([]ResourceFamily, 0),
		Sequences:        make([]SequenceEdge, 0),
		Anomalies:        make([]Anomaly, 0),
	}
}
