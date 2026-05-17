import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { 
  Play, 
  RotateCcw, 
  Terminal, 
  Activity, 
  ShieldCheck, 
  Globe, 
  Database,
  Search,
  ChevronDown
} from 'lucide-react';
import { Card, Badge, IconButton } from './ui/Shared';

/**
 * INTELLIGENCE DASHBOARD
 * Core operational view for RekonStrike
 */

export const Dashboard: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [activePhase, setActivePhase] = useState(1);
  const [logs, setLogs] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mock scan logic
  const startScan = () => {
    if (isRunning) return;
    setIsRunning(true);
    toast.success("Agent dispatched to example.com");
    addLog('info', 'strategist', 'Target example.com verified. Initializing autonomous strategy...');
  };

  const resetScan = () => {
    setIsRunning(false);
    setActivePhase(0);
    setLogs([]);
    toast("Pipeline reset", { icon: '🔄' });
  };

  const addLog = (type: string, source: string, message: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, { id: Math.random(), time, type, source, message }]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (isRunning && activePhase < 6) {
      const timer = setTimeout(() => {
        setActivePhase(prev => prev + 1);
        const phases = ['Validate', 'Passive', 'Probe', 'Content', 'Vuln', 'ROI'];
        addLog('success', 'executor', `Phase ${activePhase}: ${phases[activePhase]} completed successfully.`);
      }, 3000);
      return () => clearTimeout(timer);
    } else if (activePhase === 6) {
      setIsRunning(false);
      addLog('purple', 'triager', 'Recon complete. Top ROI target identified: dev-api.example.com (9.8).');
    }
  }, [isRunning, activePhase]);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* ── Automation Control ── */}
      <div className="grid grid-cols-12 gap-6">
        <Card 
          className="col-span-12 lg:col-span-8" 
          title="Autonomous Pipeline Execution"
          action={
            <div className="flex gap-2">
              <IconButton 
                icon={<RotateCcw size={14} />} 
                onClick={resetScan}
              />
              <button 
                onClick={startScan}
                disabled={isRunning}
                className={`flex items-center gap-2 px-4 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all ${
                  isRunning ? 'bg-emerald-500/10 text-emerald-500 cursor-not-allowed border border-emerald-500/20' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20'
                }`}
              >
                {isRunning ? <Activity size={12} className="animate-pulse" /> : <Play size={12} fill="currentColor" />}
                {isRunning ? 'Agent Active' : 'Dispatch Agent'}
              </button>
            </div>
          }
        >
          <div className="flex items-center justify-between gap-2 py-4">
            {['Validate', 'Passive', 'Probe', 'Content', 'Vuln', 'ROI'].map((name, i) => (
              <React.Fragment key={name}>
                <div className="flex flex-col items-center flex-1">
                  <div className={`
                    w-12 h-12 rounded-2xl border-2 flex items-center justify-center mb-2 transition-all duration-500 relative
                    ${i < activePhase ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-600/30' : 
                      i === activePhase && isRunning ? 'border-purple-600 text-purple-400 animate-pulse' : 
                      'border-slate-800 text-slate-700'}
                  `}>
                    {i < activePhase ? <ShieldCheck size={20} /> : <span className="text-sm font-bold">{i}</span>}
                    {i === activePhase && isRunning && (
                       <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-600 rounded-full animate-ping" />
                    )}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${i === activePhase && isRunning ? 'text-purple-400' : 'text-slate-600'}`}>
                    {name}
                  </span>
                </div>
                {i < 5 && <div className={`h-[1px] w-full max-w-[30px] mt-6 transition-colors duration-500 ${i < activePhase ? 'bg-purple-600/50' : 'bg-slate-800'}`} />}
              </React.Fragment>
            ))}
          </div>
        </Card>

        <div className="col-span-12 lg:col-span-4 grid grid-cols-2 gap-4">
          {[
            { label: 'Subdomains', val: '1,402', color: 'text-white' },
            { label: 'Live Hosts', val: '128', color: 'text-white' },
            { label: 'Findings', val: '12', color: 'text-rose-500' },
            { label: 'Agent Score', val: '8.4', color: 'text-purple-400', border: 'border-l-2 border-l-purple-600' }
          ].map(stat => (
            <div key={stat.label} className={`bg-slate-900/50 border border-white/5 rounded-xl p-5 flex flex-col justify-between hover:bg-slate-900 transition-colors ${stat.border}`}>
              <span className="text-[9px] uppercase text-slate-600 font-black tracking-widest">{stat.label}</span>
              <span className={`text-2xl font-black ${stat.color}`}>{stat.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Data Center ── */}
      <div className="grid grid-cols-12 gap-6 items-stretch">
        
        {/* Asset Inventory */}
        <Card className="col-span-12 xl:col-span-8" title="High ROI Surface Discovery">
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-left text-[11px] border-t border-white/5">
              <thead className="bg-slate-950/40 text-slate-600 uppercase font-black tracking-widest text-[9px]">
                <tr>
                  <th className="px-5 py-4">Endpoint Identity</th>
                  <th className="px-5 py-4">Technology Stack</th>
                  <th className="px-5 py-4 text-center">Threat Status</th>
                  <th className="px-5 py-4 text-right">ROI Index</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {[
                  { host: 'api-gateway-01.example.com', ip: '192.168.1.10', tech: ['Django', 'NGINX'], status: 'danger', roi: 9.8 },
                  { host: 'dev-portal.internal.example.com', ip: '10.0.5.22', tech: ['React', 'Node.js'], status: 'warning', roi: 9.2 },
                  { host: 'admin.stage.example.com', ip: '192.168.4.101', tech: ['WordPress', 'PHP'], status: 'danger', roi: 8.9 },
                  { host: 'monitoring.example.com', ip: '172.16.0.4', tech: ['Grafana', 'Prometheus'], status: 'default', roi: 7.4 },
                  { host: 'assets.example.com', ip: 'CDN / Akamai', tech: ['Static', 'Cloud'], status: 'default', roi: 4.1 },
                  { host: 'sso.example.com', ip: '192.168.1.5', tech: ['Java', 'Spring'], status: 'warning', roi: 8.2 }
                ].map((item, i) => (
                  <tr key={i} className="hover:bg-white/[0.03] transition-colors cursor-pointer group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full ${item.status === 'danger' ? 'bg-rose-500 animate-pulse' : item.status === 'warning' ? 'bg-amber-500' : 'bg-slate-700'}`} />
                        <div className="flex flex-col">
                          <span className="text-slate-200 font-bold group-hover:text-purple-400 transition-colors">{item.host}</span>
                          <span className="text-[10px] text-slate-600 font-medium">{item.ip}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-1.5">
                        {item.tech.map(t => (
                          <span key={t} className="px-2 py-0.5 bg-slate-800/80 rounded border border-white/5 text-[9px] text-slate-400">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Badge variant={item.status === 'danger' ? 'danger' : item.status === 'warning' ? 'warning' : 'default'}>
                        {item.status === 'danger' ? 'Critical' : item.status === 'warning' ? 'Suspicious' : 'Passive'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-purple-400 font-black text-xs">{item.roi.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* AI Guidance Log */}
        <Card className="col-span-12 xl:col-span-4 flex flex-col" title="Strategist Intelligence Stream">
          <div 
            ref={scrollRef}
            className="flex-1 bg-black/40 terminal-panel p-5 overflow-y-auto space-y-3 min-h-[400px] scroll-smooth"
          >
            {logs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none">
                <Terminal size={48} className="mb-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Awaiting Agent Dispatch</span>
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="flex gap-3 text-[11px] leading-relaxed animate-slide-in">
                <span className="text-slate-700 shrink-0 select-none">[{log.time}]</span>
                <span className={`shrink-0 font-black uppercase text-[9px] px-1 rounded-sm tracking-widest ${
                  log.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 
                  log.type === 'error' ? 'bg-rose-500/10 text-rose-500' : 
                  log.type === 'warning' ? 'bg-amber-500/10 text-amber-500' : 
                  log.type === 'purple' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {log.source}
                </span>
                <span className="text-slate-300 font-medium">{log.message}</span>
              </div>
            ))}
            {isRunning && <div className="animate-pulse inline-block w-2 h-4 bg-purple-600 translate-y-1" />}
          </div>
        </Card>
      </div>

      {/* ── Footprint Analytics ── */}
      <div className="grid grid-cols-12 gap-6">
         <Card className="col-span-12 lg:col-span-6" title="Infrastructure Proximity Mapping">
            <div className="h-48 flex items-center justify-center bg-slate-950/40 rounded-xl relative overflow-hidden">
               <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle,var(--color-purple-600)_1px,transparent_1px)] bg-[size:20px_20px]" />
               <div className="flex flex-col items-center gap-4 animate-pulse">
                  <Globe className="text-purple-600/50" size={32} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Generating Graph Topology...</span>
               </div>
            </div>
         </Card>
         <Card className="col-span-12 lg:col-span-6" title="Vulnerability Severity Distribution">
            <div className="h-48 flex items-end justify-between px-4 pb-2 pt-8 relative">
               <div className="absolute top-4 left-4 flex gap-4">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500" /><span className="text-[9px] font-bold text-slate-500">Critical</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-[9px] font-bold text-slate-500">Medium</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-700" /><span className="text-[9px] font-bold text-slate-500">Low</span></div>
               </div>
               {[40, 65, 30, 90, 45, 75, 85, 50, 65, 95, 40, 60].map((h, i) => (
                <div 
                  key={i} 
                  className={`flex-1 rounded-t-md transition-all duration-500 group relative border-t-2 ${
                    h > 80 ? 'bg-rose-500/10 border-rose-500 hover:bg-rose-500/20' : 
                    h > 50 ? 'bg-amber-500/10 border-amber-500 hover:bg-amber-500/20' : 
                    'bg-slate-800 border-slate-700 hover:bg-slate-700'
                  }`} 
                  style={{ height: `${h}%`, margin: '0 2px' }}
                >
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-[8px] px-1.5 py-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/5 font-bold">
                    {h} Pts
                  </div>
                </div>
              ))}
            </div>
         </Card>
      </div>

    </div>
  );
};

export default Dashboard;
