import { useState, useEffect } from "react";
import { Globe, Shield, Activity, BugPlay, Crosshair, Server, ArrowLeft, BookOpen, ChevronRight, ExternalLink, FileText } from "lucide-react";
import AuthModule from "./modules/AuthModule";
import InjectionModule from "./modules/InjectionModule";
import LogicModule from "./modules/LogicModule";
import InfraModule from "./modules/InfraModule";
import FindingTracker from "./FindingTracker";
import ReportGenerator from "./ReportGenerator";
import { fetchSubdomains, fetchLiveHosts, fetchVulnerabilities, fetchEndpoints, fetchStats } from "../api";

const modules = [
  { key: "auth", name: "Authentication & Authorization", icon: Shield, desc: "12 tests — JWT attacks, IDOR, session issues, privilege escalation, OAuth flaws", color: "#6c5ce7", Component: AuthModule },
  { key: "injection", name: "Injection Attacks", icon: Crosshair, desc: "12 tests — SQLi, XSS, SSTI, command injection, SSRF, XXE, path traversal, NoSQLi", color: "#e05a4f", Component: InjectionModule },
  { key: "logic", name: "Business Logic", icon: BugPlay, desc: "10 tests — IDOR, mass assignment, race conditions, price manipulation, step skipping, privilege escalation", color: "#f0b429", Component: LogicModule },
  { key: "infrastructure", name: "Infrastructure", icon: Server, desc: "12 tests — SSRF, XXE, CSRF, path traversal, file upload, CORS, clickjacking, info disclosure", color: "#00d4aa", Component: InfraModule },
];

function IntelPanel({ host, targetId }) {
  const [stats, setStats] = useState(null);
  const [subdomains, setSubdomains] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [vulns, setVulns] = useState([]);

  useEffect(() => {
    if (!targetId) return;
    fetchStats(targetId).then(setStats).catch(() => {});
    fetchSubdomains(targetId, { size: 50 }).then((r) => setSubdomains(r.items || [])).catch(() => {});
    fetchLiveHosts(targetId, { size: 20 }).then((r) => setHosts(r.items || [])).catch(() => {});
    fetchVulnerabilities(targetId, { size: 20 }).then((r) => setVulns(r.items || [])).catch(() => {});
  }, [targetId]);

  const currentHost = hosts.find((h) => h.url?.includes(host) || h.ip === host);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen size={14} className="text-accent" />
        <h3 className="text-xs font-semibold text-text uppercase tracking-wider">Target Intel</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface-2 border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-dim uppercase tracking-wider">Host</div>
          <div className="text-xs font-medium text-text mt-1 truncate">{host}</div>
        </div>
        <div className="bg-surface-2 border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-dim uppercase tracking-wider">IP</div>
          <div className="text-xs font-medium text-text mt-1 truncate">{currentHost?.ip || stats?.resolved_subdomains || "—"}</div>
        </div>
      </div>

      <div className="bg-surface-2 border border-border rounded-lg p-3">
        <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">Attack Surface Summary</div>
        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
          <span className="text-text-dim">Subdomains</span>
          <span className="text-text font-medium text-right">{stats?.subdomains || subdomains.length}</span>
          <span className="text-text-dim">Live Hosts</span>
          <span className="text-text font-medium text-right">{stats?.live_hosts || hosts.length}</span>
          <span className="text-text-dim">Vulnerabilities</span>
          <span className="text-text font-medium text-right">{stats?.vulnerabilities || vulns.length}</span>
          <span className="text-text-dim">Endpoints</span>
          <span className="text-text font-medium text-right">{stats?.endpoints || "—"}</span>
        </div>
      </div>

      {currentHost?.response_headers && (
        <div className="bg-surface-2 border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">Response Headers</div>
          {Object.entries(currentHost.response_headers).slice(0, 6).map(([k, v]) => (
            <div key={k} className="text-[10px] text-text-dim truncate mb-0.5">
              <span className="text-accent">{k}:</span> {String(v).slice(0, 50)}
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface-2 border border-border rounded-lg p-3">
        <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">Quick Actions</div>
        <div className="space-y-1">
          <a href={`http://${host}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-accent hover:underline">
            <ExternalLink size={11} /> Open in browser
          </a>
          <a href={`https://www.shodan.io/host/${currentHost?.ip || host}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-accent hover:underline">
            <ExternalLink size={11} /> Shodan lookup
          </a>
          <a href={`https://crt.sh/?q=${host.replace(/^https?:\/\//, "").split("/")[0]}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-accent hover:underline">
            <ExternalLink size={11} /> crt.sh certificates
          </a>
        </div>
      </div>

      {vulns.length > 0 && (
        <div className="bg-surface-2 border border-border rounded-lg p-3">
          <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1.5">Recent Vulnerabilities</div>
          {vulns.slice(0, 5).map((v, i) => (
            <div key={v.id || i} className="flex items-center gap-2 text-[11px] mb-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: { critical: "#e05a4f", high: "#f0b429", medium: "#4a9eff", low: "#7c7e94" }[v.severity] || "#7c7e94" }} />
              <span className="text-text-dim truncate">{v.name || v.template_id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ManualWorkspace({ targetId, host, onBack }) {
  const [activeModule, setActiveModule] = useState(null);
  const [showTracker, setShowTracker] = useState(false);
  const [showReport, setShowReport] = useState(false);

  if (showReport) {
    const storageKey = `findings_${targetId}`;
    let findings = [];
    try { findings = JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch {}
    return (
      <div className="space-y-4">
        <button onClick={() => setShowReport(false)}
          className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-text transition-colors">
          <ArrowLeft size={14} />
          Back to modules
        </button>
        <ReportGenerator findings={findings} targetUrl={host} onClose={() => setShowReport(false)} />
      </div>
    );
  }

  if (showTracker) {
    return (
      <div className="space-y-4">
        <button onClick={() => setShowTracker(false)}
          className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-text transition-colors">
          <ArrowLeft size={14} />
          Back to modules
        </button>
        <FindingTracker targetId={targetId} targetUrl={host} standalone={false} />
      </div>
    );
  }

  if (activeModule) {
    const mod = modules.find((m) => m.key === activeModule);
    if (!mod) {
      return <div className="text-center py-8 text-text-dim text-xs">Module not found</div>;
    }
    const Component = mod.Component;
    return (
      <div className="space-y-4">
        <button onClick={() => setActiveModule(null)}
          className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-text transition-colors">
          <ArrowLeft size={14} />
          All modules
        </button>
        <Component host={host} targetId={targetId} onBack={() => setActiveModule(null)} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BugPlay size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">Test Modules</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowReport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors">
              <FileText size={13} />
              Generate Report
            </button>
            <button onClick={() => setShowTracker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-subtle text-accent text-xs font-medium hover:bg-accent/20 transition-colors">
              <Shield size={13} />
              Finding Tracker
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button key={mod.key} onClick={() => setActiveModule(mod.key)}
                className="bg-surface-2 border border-border rounded-xl p-4 text-left card-hover group">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${mod.color}22` }}>
                    <Icon size={18} style={{ color: mod.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text group-hover:text-accent transition-colors">{mod.name}</span>
                      <ChevronRight size={14} className="text-text-dim shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-[11px] text-text-dim mt-1">{mod.desc}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-accent-subtle/30 border border-accent/20 rounded-lg p-4 text-xs text-text-dim leading-relaxed">
          <strong className="text-accent">How manual testing works:</strong><br />
          Each module has three phases: <strong>Discover</strong> (see what endpoints exist for this test type), <strong>Test</strong> (work through a checklist of specific tests with instructions), and <strong>Verify</strong> (document confirmed vulnerabilities as findings).
          <br /><br />
          When you're done, use the <strong>Generate Report</strong> button to export a professional report formatted for HackerOne, Bugcrowd, Intigriti, or as a full professional assessment. Optionally enhance your findings with AI-assisted language generation. Start with Authentication & Authorization — it has the highest concentration of critical bugs.
        </div>
      </div>

      <div className="lg:col-span-1">
        <IntelPanel host={host} targetId={targetId} />
      </div>
    </div>
  );
}
