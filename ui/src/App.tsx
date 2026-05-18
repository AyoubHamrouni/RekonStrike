import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import {
  LayoutDashboard,
  Bot,
  Shield,
  Search,
  Zap,
  Activity,
  ChevronRight,
  User,
  Settings,
  Bell,
  Command,
  Plus,
  ArrowRight
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import AgentDashboard from "./components/AgentDashboard";
import NewScan from "./components/NewScan";
import ScanProgress from "./components/ScanProgress";

/**
 * REKONSTRIKE MAIN APPLICATION SHELL
 * Professional Fixed-Layout Desktop Architecture
 */

// --- Shared Components ---

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string; active?: boolean }> = ({ to, icon, label, active }) => (
  <Link
    to={to}
    className={`flex items-center justify-between px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all duration-200 group ${
      active 
        ? 'bg-purple-600/10 text-purple-400 border border-purple-600/20 shadow-[0_0_15px_rgba(124,58,237,0.05)]' 
        : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
    }`}
  >
    <div className="flex items-center gap-3">
      <div className={`transition-transform duration-300 ${active ? 'scale-110 text-purple-500' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      <span>{label}</span>
    </div>
    {active && <div className="w-1 h-1 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(124,58,237,1)]" />}
  </Link>
);

// --- Layout Wrapper ---

const AppShell: React.FC = () => {
  const location = useLocation();
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState("example.com");

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#05060a] text-slate-200 overflow-hidden font-sans antialiased selection:bg-purple-500/30">
      
      {/* ── Fixed Sidebar ── */}
      <aside className="w-64 bg-black border-r border-white/5 flex flex-col flex-shrink-0 z-20">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-transform hover:scale-105 cursor-pointer">
              <Shield size={22} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-none">
              <h1 className="text-xl font-black tracking-tighter uppercase leading-tight">Rekon<span className="text-purple-600">Strike</span></h1>
              <span className="text-[9px] text-slate-700 font-black uppercase tracking-[0.2em] mt-1">Advanced Recon</span>
            </div>
          </div>
          
          <div className="space-y-8">
            <div className="space-y-1">
              <NavItem to="/" icon={<LayoutDashboard size={16} />} label="Intelligence" active={location.pathname === "/"} />
              <NavItem to="/agent" icon={<Bot size={16} />} label="Agent Node" active={location.pathname === "/agent"} />
              <NavItem to="/assets" icon={<Activity size={16} />} label="Surface Area" active={location.pathname === "/assets"} />
              <NavItem to="/scans" icon={<Zap size={16} />} label="Pipeline" active={location.pathname === "/scans"} />
            </div>

            <div className="space-y-3">
               <div className="px-4 text-[9px] font-black uppercase tracking-[0.3em] text-slate-700">Infrastructure</div>
               <nav className="space-y-1">
                  <NavItem to="/settings" icon={<Settings size={16} />} label="System" active={location.pathname === "/settings"} />
                  <NavItem to="/notifications" icon={<Bell size={16} />} label="Events" active={location.pathname === "/notifications"} />
               </nav>
            </div>
          </div>
        </div>
        
        <div className="mt-auto p-4 border-t border-white/5 bg-slate-950/20">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] transition-all cursor-pointer group border border-transparent hover:border-white/5">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 border border-white/10 flex items-center justify-center text-[10px] font-black">AB</div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-black rounded-full shadow-lg" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-black text-slate-200 group-hover:text-purple-400 transition-colors">Ayoub B.</span>
              <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Architect</span>
            </div>
          </button>
        </div>
      </aside>

      {/* ── Main Workspace Area ── */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#07080d] relative">
        
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-purple-600/5 blur-[150px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        {/* Fixed Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/40 backdrop-blur-2xl z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 px-3 py-1.5 rounded-lg group hover:border-white/20 transition-all cursor-pointer">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(124,58,237,1)]" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">{selectedTarget}</span>
              <ChevronRight size={12} className="text-slate-700" />
            </div>
            
            <button className="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center text-slate-600 hover:text-slate-200 hover:bg-white/5 transition-all">
              <Plus size={16} />
            </button>
          </div>
          
          <div className="flex items-center gap-8">
            <div className={`relative transition-all duration-500 flex items-center ${searchFocused ? 'w-96' : 'w-72'}`}>
              <Search className={`absolute left-3 w-4 h-4 transition-colors ${searchFocused ? 'text-purple-400' : 'text-slate-600'}`} />
              <input 
                id="global-search"
                type="text" 
                placeholder="GLOBAL COMMAND (⌘ + K)" 
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="bg-slate-900/40 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-[10px] font-black tracking-widest w-full focus:outline-none focus:border-purple-600/30 focus:bg-black/60 transition-all placeholder:text-slate-800"
              />
              {!searchFocused && <Command size={12} className="absolute right-3 text-slate-800" />}
            </div>
            
            <div className="h-6 w-[1px] bg-white/5" />

            <div className="flex items-center gap-3">
               <div className="flex flex-col text-right mr-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">System Status</span>
                  <span className="text-[10px] font-black uppercase text-emerald-500">All Nodes Nominal</span>
               </div>
               <div className="w-10 h-10 rounded-xl border border-white/5 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all cursor-pointer relative group">
                  <Bell size={18} />
                  <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 border-2 border-black rounded-full group-hover:scale-125 transition-transform" />
               </div>
            </div>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          <div className="p-8 max-w-[1600px] mx-auto min-h-full">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/agent" element={<AgentDashboard />} />
              <Route path="/assets" element={<Placeholder title="Attack Surface Area" icon={<Activity size={48} />} />} />
              <Route path="/scans" element={<NewScan />} />
              <Route path="/scans/:sessionId" element={<ScanProgress />} />
              <Route path="/settings" element={<Placeholder title="System Configuration" icon={<Settings size={48} />} />} />
            </Routes>
          </div>
        </div>

      </main>
    </div>
  );
};

const Placeholder: React.FC<{ title: string; icon: React.ReactNode }> = ({ title, icon }) => (
  <div className="h-[70vh] flex flex-col items-center justify-center animate-fade-in">
    <div className="w-24 h-24 rounded-3xl bg-slate-900/50 border border-white/5 flex items-center justify-center mb-8 text-slate-700 group hover:border-purple-600/20 hover:text-purple-600 transition-all duration-500 shadow-2xl">
      {icon}
    </div>
    <h2 className="text-xl font-black uppercase tracking-[0.3em] text-slate-400 mb-4">{title}</h2>
    <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest max-w-md text-center leading-relaxed opacity-50">
      Node synchronization in progress. Initializing peripheral modules and establishing encrypted handshakes with discovery clusters.
    </p>
    <div className="mt-12 flex gap-4">
       <button className="px-6 py-2 bg-purple-600/10 border border-purple-600/20 text-purple-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all">Force Sync</button>
       <Link to="/" className="px-6 py-2 bg-slate-900 border border-white/5 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-white transition-all flex items-center gap-2">Return Home <ArrowRight size={12} /></Link>
    </div>
  </div>
);

// --- App Root ---

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#05060a",
            color: "#e2e3eb",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "16px",
            fontSize: "11px",
            fontWeight: "900",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "12px 20px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)"
          },
        }}
      />
      <AppShell />
    </BrowserRouter>
  );
}
