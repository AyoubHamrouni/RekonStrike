import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Crosshair, Globe, Server, BookOpen, HelpCircle,
  CheckCircle, Loader2, ChevronDown, ChevronUp, AlertTriangle, RefreshCw,
} from "lucide-react";
import { fetchPhases, startScan } from "../api";
import toast from "react-hot-toast";

const TARGET_TYPES = [
  { value: "domain", label: "Domain", icon: Globe, desc: "Discover subdomains, crawl endpoints, and scan for vulnerabilities across the entire domain scope." },
  { value: "ip", label: "IP Range", icon: Server, desc: "Scan IP ranges for open ports, services, and hosted web applications." },
];

const LEARN_TYPES = {
  domain: "Best for bug bounty programs where you need to map the entire attack surface from a root domain. Starts with passive discovery and progressively deepens.",
  ip: "Best for infrastructure assessments where you have a known IP range. Skips subdomain discovery and goes straight to port scanning.",
};

const LEARN_PHASES = {
  0: "Validates the target and loads scope rules to ensure everything is configured correctly.",
  1: "Searches public sources (certificate logs, search engines, GitHub) to discover subdomains without touching the target's servers.",
  2: "Checks which subdomains actually resolve in DNS, what ports are open, and if any cloud assets exist.",
  3: "Makes HTTP requests to every live host to identify web servers, technologies, and SSL certificates.",
  4: "Crawls websites and fetches historical URLs to discover hidden endpoints, API routes, and JS files.",
  5: "Runs Nuclei vulnerability templates against all discovered services to find CVEs and misconfigurations.",
  6: "Calculates ROI scores and consolidates all findings into a prioritized report.",
};

const PHASE_NAMES = {
  0: "Scope Validation",
  1: "Passive Reconnaissance",
  2: "Active Reconnaissance",
  3: "Web Probing",
  4: "Content Discovery",
  5: "Vulnerability Scanning",
  6: "ROI Reporting",
};

export default function NewScan() {
  const navigate = useNavigate();
  const [target, setTarget] = useState("");
  const [targetType, setTargetType] = useState("domain");
  const [phases, setPhases] = useState([]);
  const [selectedPhases, setSelectedPhases] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [phasesLoading, setPhasesLoading] = useState(true);
  const [phasesError, setPhasesError] = useState(null);
  const [showLearn, setShowLearn] = useState({});

  useEffect(() => {
    setPhasesLoading(true);
    setPhasesError(null);
    fetchPhases()
      .then((data) => {
        setPhases(data);
        setSelectedPhases(new Set(data.map((p) => p.id)));
      })
      .catch((err) => {
        setPhasesError(err.message || "Failed to load phases");
        toast.error("Failed to load phases");
      })
      .finally(() => setPhasesLoading(false));
  }, []);

  const validate = useCallback(() => {
    const errs = {};
    if (!target.trim()) errs.target = "Target is required";
    if (targetType === "domain" && !/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(target.trim())) {
      errs.target = "Enter a valid domain (e.g., example.com)";
    }
    if (selectedPhases.size === 0) errs.phases = "Select at least one phase";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [target, targetType, selectedPhases]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await startScan(target.trim(), targetType, Array.from(selectedPhases));
      toast.success("Scan started");
      navigate(`/scan/${result.session_id || result.id}`);
    } catch (err) {
      toast.error(err.message || "Failed to start scan");
    } finally {
      setSubmitting(false);
    }
  }, [target, targetType, selectedPhases, validate, navigate]);

  const togglePhase = (phaseId) => {
    setSelectedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId); else next.add(phaseId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPhases.size === phases.length) {
      setSelectedPhases(new Set());
    } else {
      setSelectedPhases(new Set(phases.map((p) => p.id)));
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">New Reconnaissance Scan</h1>
        <p className="text-sm text-text-dim mt-1">Configure and launch a new security assessment</p>
      </div>

      {/* Target & Type */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
        <div>
          <label htmlFor="target-input" className="text-xs font-medium text-text-dim mb-1.5 block">
            Target
          </label>
          <input
            id="target-input"
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={targetType === "domain" ? "example.com" : "192.168.1.0/24"}
            className={`w-full px-3 py-2 bg-surface-2 border rounded-lg text-sm text-text placeholder:text-text-dim/40 focus:outline-none focus:border-accent transition-colors ${
              errors.target ? "border-red" : "border-border"
            }`}
            aria-invalid={!!errors.target}
            aria-describedby={errors.target ? "target-error" : undefined}
          />
          {errors.target && (
            <p id="target-error" className="text-xs text-red mt-1 flex items-center gap-1">
              <AlertTriangle size={11} /> {errors.target}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-text-dim mb-2 block">Target Type</label>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Target type">
            {TARGET_TYPES.map(({ value, label, icon: Icon, desc }) => (
              <button
                key={value}
                onClick={() => setTargetType(value)}
                role="radio"
                aria-checked={targetType === value}
                className={`text-left p-3 rounded-lg border transition-all ${
                  targetType === value
                    ? "bg-accent-subtle border-accent"
                    : "bg-surface-2 border-border hover:border-border-light"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} className={targetType === value ? "text-accent" : "text-text-dim"} />
                  <span className={`text-sm font-medium ${targetType === value ? "text-accent" : "text-text"}`}>{label}</span>
                  {targetType === value && <CheckCircle size={14} className="ml-auto text-accent" />}
                </div>
                <p className="text-xs text-text-dim leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowLearn((s) => ({ ...s, types: !s.types }))}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover mt-2 transition-colors"
            type="button"
          >
            <HelpCircle size={11} />
            {showLearn.types ? "Hide explanation" : "Which one should I choose?"}
            {showLearn.types ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showLearn.types && (
            <div className="mt-2 p-3 rounded-lg bg-accent-subtle/30 border border-accent/20 text-xs text-text-dim leading-relaxed animate-fade-in">
              <strong className="text-text">{targetType === "domain" ? "Domain" : "IP Range"}:</strong>{" "}
              {LEARN_TYPES[targetType]}
            </div>
          )}
        </div>
      </div>

      {/* Phases */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text">Phases</h2>
          {!phasesLoading && !phasesError && (
            <button
              onClick={toggleAll}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
              type="button"
            >
              {selectedPhases.size === phases.length ? "Clear All" : "Select All"}
            </button>
          )}
        </div>

        {phasesLoading ? (
          <div className="space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <div className="skeleton w-5 h-5 rounded shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="skeleton h-4 w-40 rounded" />
                  <div className="skeleton h-3 w-64 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : phasesError ? (
          <div className="flex flex-col items-center py-8 text-center">
            <AlertTriangle size={20} className="text-red mb-2" />
            <p className="text-sm text-text-dim mb-3">Failed to load phases</p>
            <button
              onClick={() => {
                setPhasesLoading(true);
                setPhasesError(null);
                fetchPhases()
                  .then((data) => { setPhases(data); setSelectedPhases(new Set(data.map((p) => p.id))); })
                  .catch((err) => setPhasesError(err.message))
                  .finally(() => setPhasesLoading(false));
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-2 hover:bg-border text-text rounded-lg text-xs font-medium transition-colors"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : phases.length === 0 ? (
          <p className="text-sm text-text-dim py-4 text-center">No phases available</p>
        ) : (
          <>
            <div className="space-y-1" role="group" aria-label="Scan phases">
              {phases.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePhase(p.id)}
                  role="checkbox"
                  aria-checked={selectedPhases.has(p.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedPhases.has(p.id)
                      ? "bg-accent-subtle border-accent/30"
                      : "bg-surface-2 border-border hover:border-border-light"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      selectedPhases.has(p.id)
                        ? "bg-accent text-white"
                        : "bg-surface border border-border"
                    }`}>
                      {selectedPhases.has(p.id) && <CheckCircle size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text">
                        Phase {p.number || p.id}: {p.name || PHASE_NAMES[p.id] || `Phase ${p.id}`}
                      </div>
                      <p className="text-xs text-text-dim mt-0.5 leading-relaxed">
                        {p.description || LEARN_PHASES[p.id] || ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {errors.phases && (
              <p className="text-xs text-red mt-2 flex items-center gap-1">
                <AlertTriangle size={11} /> {errors.phases}
              </p>
            )}
          </>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || phasesLoading}
        className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Starting Scan...
          </>
        ) : (
          <>
            <Crosshair size={16} />
            Start Scan
          </>
        )}
      </button>
    </div>
  );
}
