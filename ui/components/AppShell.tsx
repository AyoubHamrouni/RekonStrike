"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  Bot,
  ShieldAlert,
  Zap,
  Settings,
  Bell,
  Search,
  Command,
  ChevronRight,
  Plus,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { path: "/workspace", label: "Workspace", icon: LayoutDashboard, end: true },
  { path: "/targets", label: "Targets", icon: Target },
  { path: "/agent", label: "Agent", icon: Bot },
  { path: "/findings", label: "Findings", icon: ShieldAlert },
  { path: "/scans", label: "Scans", icon: Zap },
];

const NavItem: React.FC<{
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
}> = ({ href, icon, label, active, onClick }) => (
  <Link
    href={href}
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all duration-200 group border ${
      active
        ? "bg-purple-600/10 text-purple-400 border-purple-600/20 shadow-[0_0_15px_rgba(124,58,237,0.05)]"
        : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.03] border-transparent"
    }`}
  >
    <div
      className={`transition-transform duration-300 ${
        active ? "scale-110 text-purple-500" : "group-hover:scale-110"
      }`}
    >
      {icon}
    </div>
    <span>{label}</span>
    {active && (
      <div className="ml-auto w-1 h-1 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(124,58,237,1)]" />
    )}
  </Link>
);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [searchFocused, setSearchFocused] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTarget] = useState("example.com");

  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  const isActive = (path: string, end?: boolean) => {
    if (end) return pathname === path;
    return pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen w-full bg-[#05060a] text-slate-200 overflow-hidden font-sans antialiased selection:bg-purple-500/30">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        role="navigation"
        aria-label="Main navigation"
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-[var(--color-sidebar)] border-r border-white/5
          flex flex-col flex-shrink-0 transition-transform duration-300 ease-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between p-4 lg:p-8">
          <Link
            href="/workspace"
            onClick={closeSidebar}
            className="flex items-center gap-3 group"
          >
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center font-black text-white italic shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-transform group-hover:scale-105 cursor-pointer">
              <ShieldAlert size={22} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-none">
              <h1 className="text-xl font-black tracking-tighter uppercase leading-tight">
                Rekon<span className="text-purple-600">Strike</span>
              </h1>
              <span className="text-[9px] text-slate-700 font-black uppercase tracking-[0.2em] mt-1">
                Advanced Recon
              </span>
            </div>
          </Link>
          <button
            onClick={closeSidebar}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all cursor-pointer"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 lg:px-8">
          <div className="space-y-8">
            <nav aria-label="Primary pages" className="space-y-1">
              {navItems.map((item) => (
                <NavItem
                  key={item.path}
                  href={item.path}
                  icon={<item.icon size={16} />}
                  label={item.label}
                  active={isActive(item.path, item.end)}
                  onClick={closeSidebar}
                />
              ))}
            </nav>

            <div className="space-y-3">
              <div className="px-4 text-[9px] font-black uppercase tracking-[0.3em] text-slate-700">
                Infrastructure
              </div>
              <nav className="space-y-1">
                <NavItem
                  href="/settings"
                  icon={<Settings size={16} />}
                  label="System"
                  active={isActive("/settings")}
                  onClick={closeSidebar}
                />
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-white/5 bg-slate-950/20">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/[0.05] transition-all cursor-pointer group border border-transparent hover:border-white/5">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 border border-white/10 flex items-center justify-center text-[10px] font-black">
                AB
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-black rounded-full shadow-lg" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-black text-slate-200 group-hover:text-purple-400 transition-colors">
                Ayoub B.
              </span>
              <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                Architect
              </span>
            </div>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[var(--color-bg)] relative">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-purple-600/5 blur-[150px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <header role="banner" className="h-16 border-b border-white/5 flex items-center justify-between px-4 lg:px-8 bg-black/40 backdrop-blur-2xl z-10 flex-shrink-0">
          <div className="flex items-center gap-2 lg:gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2 bg-slate-900/50 border border-white/5 px-3 py-1.5 rounded-lg group hover:border-white/20 transition-all cursor-pointer">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(124,58,237,1)]" />
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                {selectedTarget}
              </span>
              <ChevronRight size={12} className="text-slate-700" />
            </div>
            <Link
              href="/targets"
              className="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center text-slate-600 hover:text-slate-200 hover:bg-white/5 transition-all"
            >
              <Plus size={16} />
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
            <div className="relative flex items-center w-28 xs:w-36 sm:w-44 lg:w-56">
              <Search
                className={`absolute left-2.5 w-3.5 h-3.5 transition-colors shrink-0 ${
                  searchFocused ? "text-purple-400" : "text-slate-600"
                }`}
              />
              <input
                id="global-search"
                type="search"
                role="searchbox"
                placeholder='SEARCH (⌘K)'
                aria-label="Global search"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="bg-slate-900/40 border border-white/5 rounded-xl pl-8 pr-3 py-2 text-[10px] font-black tracking-widest w-full focus:outline-none focus:border-purple-600/30 focus:bg-black/60 transition-all placeholder:text-slate-800 truncate"
              />
              {!searchFocused && (
                <Command size={11} className="absolute right-2.5 text-slate-800 pointer-events-none hidden sm:block" />
              )}
            </div>

            <div className="h-5 w-[1px] bg-white/5 hidden sm:block" />

            <div className="hidden sm:flex-col text-right mr-1 sm:flex lg:flex">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-700 hidden lg:block">
                System Status
              </span>
              <span className="text-[10px] font-black uppercase text-emerald-500 hidden lg:block">
                All Nodes Nominal
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all cursor-pointer relative group shrink-0">
              <Bell size={15} />
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 border border-black rounded-full group-hover:scale-125 transition-transform" />
            </div>
          </div>
        </header>

        <div id="main-content" className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          <div className="p-4 lg:p-6 xl:p-8 max-w-7xl mx-auto min-h-full">{children}</div>
        </div>
      </main>
    </div>
  );
}
