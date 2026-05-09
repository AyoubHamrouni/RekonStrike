import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Crosshair, ChevronRight, Info, Shield, Globe, Building2, Link as LinkIcon, Check, Target, HelpCircle, BookOpen } from "lucide-react";
import toast from "react-hot-toast";
import { startScan, fetchPhases } from "../api";

const typeMeta = {
  wildcard: { icon: Globe, desc: "Enumerate all subdomains under a wildcard domain", example: "*.example.com", learn: "Best for bug bounty programs that scope *.domain.com. The framework will find all subdomains, check which are alive, and scan for vulnerabilities." },
  domain: { icon: LinkIcon, desc: "Scan a specific domain and its subdomains", example: "example.com", learn: "Use when you have a single domain target. Works great for penetration tests where you need deep coverage of one domain." },
  company: { icon: Building2, desc: "Discover all domains owned by an organization", example: "Acme Inc", learn: "Enterprise-level recon. Uses ASN lookups, WHOIS records, and SecurityTrails API to find every domain a company owns. Requires API keys for best results." },
  url: { icon: Shield, desc: "Probe a specific URL for vulnerabilities", example: "https://example.com/path", learn: "Quick vulnerability check on a specific URL. Skips subdomain discovery and goes straight to web probing and scanning." },
};

const phaseLearn = {
  0: { what: "Validates the target domain and loads scope rules. Ensures you're scanning something valid before spending time on it.", why: "Prevents wasted scans on malformed inputs or out-of-scope targets. Always start here." },
  1: { what: "Uses public OSINT sources (certificate transparency logs, search engines, GitHub) to find subdomains without ever touching the target's servers.", why: "Passive recon is stealthy and legal — you're just reading public data. This phase typically finds 80% of all subdomains." },
  2: { what: "Takes the subdomains from Phase 1 and actively resolves them (DNS lookups), scans for open ports (Naabu), and checks for cloud assets (CloudEnum).", why: "Not all subdomains are alive. This phase separates what actually exists from what's historical or dangling." },
  3: { what: "Makes HTTP requests to every live host to detect web servers, technologies (React, Nginx, Cloudflare), SSL certificates, and response headers.", why: "Understanding the tech stack tells you what vulnerabilities to look for. A React app needs different tests than a WordPress site." },
  4: { what: "Crawls websites (GoSpider, Katana), fetches historical URLs (GAU), fuzzes for hidden paths (ffuf), and generates custom wordlists (CeWL).", why: "The biggest attacks come from hidden endpoints — admin panels, API docs, debug pages, backup files. You can't hack what you can't find." },
  5: { what: "Runs 10,000+ Nuclei templates against discovered hosts to find CVEs, misconfigurations, exposed panels, and security gaps.", why: "Automates the most tedious part of hunting. Nuclei checks everything from critical RCEs to informational headers." },
  6: { what: "Scores every finding (50+ signals) and presents a prioritized view of what to investigate first.", why: "Not all findings are equal. ROI scoring tells you which hosts are most likely to have a pay-out-worthy bug." },
};

export default function NewScan() {
  const navigate = useNavigate();
  const [target, setTarget] = useState("");
  const [targetType, setTargetType] = useState("wildcard");
  const [phases, setPhases] = useState([]);
  const [selectedPhases, setSelectedPhases] = useState([]);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState({});
  const [showLearn, setShowLearn] = useState(null);
  const [showTypeLearn, setShowTypeLearn] = useState(null);

  useEffect(() => {
    fetchPhases().then((p) => {
      setPhases(p);
      setSelectedPhases(p.map((x) => x.number));
    }).catch(() => toast.error("Failed to load phases"));
  }, []);

  const validate = () => {
    const e = {};
    if (!target.trim()) e.target = "Target is required";
    else if (targetType === "wildcard" && !target.includes(".")) e.target = "Enter a valid domain (e.g., example.com)";
    else if (targetType === "url" && !target.startsWith("http")) e.target = "Enter a valid URL starting with https://";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || running) return;
    setRunning(true);
    try {
      const result = await startScan(target.trim(), targetType, selectedPhases);
      toast.success("Scan started successfully");
      navigate(`/scan/${result.session_id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const togglePhase = (num) => {
    setSelectedPhases((prev) =>
      prev.includes(num) ? prev.filter((p) => p !== num) : [...prev, num]
    );
  };

  const selectAllPhases = () => setSelectedPhases(phases.map((p) => p.number));
  const deselectAllPhases = () => setSelectedPhases([]);

  const TypeIcon = typeMeta[targetType].icon;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-accent-subtle">
          <Crosshair size={20} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text">New Scan</h1>
          <p className="text-sm text-text-dim mt-0.5">Configure and launch a reconnaissance scan</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text flex items-center gap-2">
              <Target className="text-accent" size={16} />
              Target Type
            </h2>
            <a href="#learn-types" onClick={(e) => { e.preventDefault(); setShowTypeLearn(showTypeLearn ? null : targetType); }}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors">
              <BookOpen size={12} />
              Which one should I choose?
            </a>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {Object.entries(typeMeta).map(([key, meta]) => {
              const Icon = meta.icon;
              const active = targetType === key;
              return (
                <button key={key} type="button" onClick={() => { setTargetType(key); setErrors({}); setShowLearn(null); setShowTypeLearn(null); }}
                  className={`
                    flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs font-medium
                    transition-all duration-150 border relative
                    ${active
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-border bg-transparent text-text-dim hover:text-text hover:bg-surface-2"
                    }
                  `}>
                  <Icon size={18} />
                  <span className="capitalize">{key}</span>
                </button>
              );
            })}
          </div>

          {showTypeLearn && typeMeta[showTypeLearn] && (
            <div className="bg-accent-subtle/50 border border-accent/20 rounded-lg p-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <BookOpen size={16} className="text-accent mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-text mb-1">
                    {showTypeLearn.charAt(0).toUpperCase() + showTypeLearn.slice(1)} Workflow
                  </h4>
                  <p className="text-xs text-text-dim leading-relaxed">{typeMeta[showTypeLearn].learn}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-dim mb-1.5">
              Target
            </label>
            <div className="relative">
              <input
                value={target}
                onChange={(e) => { setTarget(e.target.value); setErrors({}); }}
                placeholder={typeMeta[targetType].example}
                className={`
                  w-full px-3.5 py-2.5 bg-bg border rounded-lg text-sm text-text
                  placeholder:text-text-dim/40 outline-none transition-colors font-mono
                  ${errors.target ? "border-red" : "border-border focus:border-accent"}
                `}
                autoFocus
              />
            </div>
            {errors.target && <p className="text-xs text-red mt-1.5">{errors.target}</p>}
            <p className="text-xs text-text-dim/60 mt-1.5">{typeMeta[targetType].desc}</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChevronRight className="text-accent" size={16} />
              <h2 className="text-sm font-semibold text-text">Phases</h2>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={selectAllPhases}
                className="text-xs text-accent hover:text-accent-hover transition-colors">
                Select All
              </button>
              <button type="button" onClick={deselectAllPhases}
                className="text-xs text-text-dim hover:text-text transition-colors">
                Clear
              </button>
            </div>
          </div>

          <p className="text-xs text-text-dim/60 leading-relaxed">
            Each phase builds on the previous one. Start with all phases for a complete recon.
            Deselect phases you've already run to save time on repeated scans.
          </p>

          <div className="space-y-2">
            {phases.map((p) => {
              const selected = selectedPhases.includes(p.number);
              const learning = phaseLearn[p.number];
              const expanded = showLearn === p.number;
              return (
                <div key={p.number}
                  className={`
                    rounded-lg border transition-all duration-150
                    ${selected ? "bg-accent-subtle/30 border-accent/20" : "bg-transparent border-transparent"}
                  `}>
                  <div className="flex items-start gap-3 p-3">
                    <button type="button" onClick={() => togglePhase(p.number)}
                      className={`
                        w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5
                        transition-colors duration-150 cursor-pointer border
                        ${selected ? "bg-accent text-white border-accent" : "bg-transparent border-border hover:border-accent"}
                      `}>
                      {selected && <Check size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${selected ? "text-text" : "text-text-dim"}`}>
                          Phase {p.number}: {p.name}
                        </span>
                      </div>
                      <p className="text-xs text-text-dim/70 mt-0.5">{p.description}</p>
                      {selected && learning && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-start gap-1.5">
                            <HelpCircle size={11} className="text-accent mt-0.5 shrink-0" />
                            <p className="text-[11px] text-text-dim/80 leading-relaxed">{learning.what}</p>
                          </div>
                          <div className="flex items-start gap-1.5">
                            <BookOpen size={11} className="text-yellow mt-0.5 shrink-0" />
                            <p className="text-[11px] text-yellow/70 leading-relaxed">{learning.why}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => setShowLearn(expanded ? null : p.number)}
                      className="p-1 rounded hover:bg-surface-2 text-text-dim hover:text-text transition-colors shrink-0">
                      <Info size={14} />
                    </button>
                  </div>
                  {expanded && learning && (
                    <div className="px-3 pb-3 animate-fade-in">
                      <div className="ml-8 p-3 rounded-lg bg-surface-2 border border-border">
                        <h4 className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
                          <BookOpen size={12} className="text-accent" />
                          What's happening here?
                        </h4>
                        <p className="text-[11px] text-text-dim/80 leading-relaxed mb-2">{learning.what}</p>
                        <h4 className="text-xs font-semibold text-text mb-2 flex items-center gap-1.5">
                          <Crosshair size={12} className="text-yellow" />
                          Why does it matter?
                        </h4>
                        <p className="text-[11px] text-yellow/70 leading-relaxed">{learning.why}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={running || selectedPhases.length === 0}
          className={`
            w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold
            transition-all duration-150
            ${running || selectedPhases.length === 0
              ? "bg-border text-text-dim cursor-not-allowed"
              : "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20"
            }
          `}
        >
          {running ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Starting Scan...
            </>
          ) : (
            <>
              <Crosshair size={16} />
              Launch Scan ({selectedPhases.length} phase{selectedPhases.length !== 1 ? "s" : ""})
            </>
          )}
        </button>
      </form>
    </div>
  );
}
