import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import {
  LayoutDashboard,
  Crosshair,
  Bot,
  Shield,
  ChevronRight,
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import NewScan from "./components/NewScan";
import TargetDetail from "./components/TargetDetail";
import ScanProgress from "./components/ScanProgress";
import AgentDashboard from "./components/AgentDashboard";
import { fetchHealth } from "./api";
import type { NavItem } from "./types";

const navItems: NavItem[] = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { path: "/agent", label: "Agent", icon: Bot },
  { path: "/new", label: "New Scan", icon: Crosshair },
];

// ── NavLink ──────────────────────────────────────────────────────────────

function NavLink({ item, location }: { item: NavItem; location: ReturnType<typeof useLocation> }) {
  const active = item.end
    ? location.pathname === item.path
    : location.pathname.startsWith(item.path);
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-150 border-l-2 ${
        active
          ? "bg-accent/10 border-l-2 border-accent text-accent"
          : "border-l-2 border-transparent text-text-dim hover:text-text hover:bg-white/[0.03]"
      }`}
    >
      <Icon size={18} />
      {item.label}
      {active && <ChevronRight size={14} className="ml-auto opacity-50" />}
    </Link>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────

function Sidebar({ location }: { location: ReturnType<typeof useLocation> }) {
  return (
    <aside
      className="w-64 shrink-0 overflow-y-auto bg-sidebar border-r border-white/5 flex flex-col"
      aria-label="Main navigation"
    >
      <div className="h-14 flex items-center gap-3 px-5 border-b border-white/5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <Shield size={16} className="text-white" />
        </div>
        <span className="font-bold text-lg tracking-tight text-text">
          RekonStrike
        </span>
      </div>

      <nav className="flex-1 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink key={item.path} item={item} location={location} />
        ))}
      </nav>

      <div className="p-4 border-t border-white/5 shrink-0">
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse-dot" />
          v0.2.0
        </div>
      </div>
    </aside>
  );
}

// ── NotFound ─────────────────────────────────────────────────────────────

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-white/5 flex items-center justify-center mb-4">
        <Shield size={28} className="text-text-dim" />
      </div>
      <h1 className="text-xl font-bold text-text mb-2">Page not found</h1>
      <p className="text-sm text-text-dim mb-6">
        The page you're looking for doesn't exist.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
      >
        <LayoutDashboard size={16} />
        Back to Dashboard
      </Link>
    </div>
  );
}

// ── AppShell ─────────────────────────────────────────────────────────────

function AppShell() {
  const location = useLocation();
  const [healthy, setHealthy] = useState(true);

  const checkHealth = useCallback(() => {
    fetchHealth()
      .then(() => setHealthy(true))
      .catch(() => {
        if (healthy) {
          setHealthy(false);
          toast.error("API server unreachable");
        }
      });
  }, [healthy]);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <Sidebar location={location} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-white/5 bg-surface flex items-center justify-end px-6">
          <div className="flex items-center gap-2 text-xs">
            <div
              className={`w-2 h-2 rounded-full ${
                healthy ? "bg-green" : "bg-red"
              } animate-pulse-dot`}
              aria-hidden="true"
            />
            <span className="text-text-dim">
              {healthy ? "Connected" : "Disconnected"}
            </span>
          </div>
        </header>

        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-6"
        >
          <div className="max-w-[1600px] mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new" element={<NewScan />} />
              <Route path="/target/:id" element={<TargetDetail />} />
              <Route path="/scan/:sessionId" element={<ScanProgress />} />
              <Route path="/agent" element={<AgentDashboard />} />
              <Route path="/agent/:targetId" element={<AgentDashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#1a1b26",
            color: "#e4e5ed",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: "8px",
            fontSize: "14px",
          },
          success: { iconTheme: { primary: "#00d4aa", secondary: "#1a1b26" } },
          error: { iconTheme: { primary: "#e05a4f", secondary: "#1a1b26" } },
        }}
      />
      <AppShell />
    </BrowserRouter>
  );
}
