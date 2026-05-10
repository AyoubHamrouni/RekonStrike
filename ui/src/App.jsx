import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { Toaster, toast } from "react-hot-toast";
import {
  LayoutDashboard, Crosshair, Activity, Target, Shield,
  Menu, X, ChevronRight, Bot,
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import NewScan from "./components/NewScan";
import TargetDetail from "./components/TargetDetail";
import ScanProgress from "./components/ScanProgress";
import AgentDashboard from "./components/AgentDashboard";
import { fetchHealth } from "./api";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/agent", label: "Agent", icon: Bot },
  { path: "/new", label: "New Scan", icon: Crosshair },
];

function Sidebar({ open, onClose }) {
  const location = useLocation();

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64
        bg-surface border-r border-border
        transform transition-transform duration-200 ease-out
        ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        flex flex-col
      `}>
        <div className="h-14 flex items-center gap-3 px-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">RekonStrike</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
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
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-dim">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse-dot" />
            v0.1.0
          </div>
        </div>
      </aside>
    </>
  );
}

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [healthy, setHealthy] = useState(true);

  useEffect(() => {
    fetchHealth()
      .then(() => setHealthy(true))
      .catch(() => {
        setHealthy(false);
        toast.error("API server unreachable");
      });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-surface flex items-center px-4 gap-3 shrink-0">
          <button
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-2 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${healthy ? "bg-green" : "bg-red"} animate-pulse-dot`} />
            <span className="text-text-dim">{healthy ? "Connected" : "Disconnected"}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewScan />} />
            <Route path="/target/:id" element={<TargetDetail />} />
            <Route path="/scan/:sessionId" element={<ScanProgress />} />
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/agent/:targetId" element={<AgentDashboard />} />
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
