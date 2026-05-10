import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import {
  LayoutDashboard, Crosshair, Bot, Shield,
  Menu, X, ChevronRight,
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import NewScan from "./components/NewScan";
import TargetDetail from "./components/TargetDetail";
import ScanProgress from "./components/ScanProgress";
import AgentDashboard from "./components/AgentDashboard";
import { fetchHealth } from "./api";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { path: "/agent", label: "Agent", icon: Bot },
  { path: "/new", label: "New Scan", icon: Crosshair },
];

function NavLink({ item, onClose, location }) {
  const active = item.end ? location.pathname === item.path : location.pathname.startsWith(item.path);
  return (
    <Link
      to={item.path}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
        transition-all duration-150
        ${active
          ? "bg-accent/10 text-accent"
          : "text-text-dim hover:text-text hover:bg-surface-2"
        }
      `}
    >
      <item.icon size={18} />
      {item.label}
      {active && <ChevronRight size={14} className="ml-auto opacity-50" />}
    </Link>
  );
}

function Sidebar({ open, onClose }) {
  const location = useLocation();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64
          bg-surface border-r border-border
          transform transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          flex flex-col
        `}
        aria-label="Main navigation"
      >
        <div className="h-14 flex items-center gap-3 px-5 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">RekonStrike</span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.path} item={item} onClose={onClose} location={location} />
          ))}
        </nav>

        <div className="p-3 border-t border-border shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-dim">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse-dot" />
            v0.2.0
          </div>
        </div>
      </aside>
    </>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4">
        <Shield size={28} className="text-text-dim" />
      </div>
      <h1 className="text-xl font-bold text-text mb-2">Page not found</h1>
      <p className="text-sm text-text-dim mb-6">The page you're looking for doesn't exist.</p>
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

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      <a href="#main-content" className="skip-link">Skip to content</a>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-surface flex items-center px-4 gap-3 shrink-0 no-print">
          <button
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-2 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2 text-xs">
            <div
              className={`w-2 h-2 rounded-full ${healthy ? "bg-green" : "bg-red"} animate-pulse-dot`}
              aria-hidden="true"
            />
            <span className="text-text-dim">
              {healthy ? "Connected" : "Disconnected"}
            </span>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewScan />} />
            <Route path="/target/:id" element={<TargetDetail />} />
            <Route path="/scan/:sessionId" element={<ScanProgress />} />
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/agent/:targetId" element={<AgentDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#1a1b26",
            color: "#e4e5ed",
            border: "1px solid #252634",
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
