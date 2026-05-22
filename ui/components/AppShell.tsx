"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  Radar,
  ShieldAlert,
  Bot,
  FlaskConical,
  Trophy,
  FileText,
  Terminal,
  Search,
  Bell,
  Activity,
} from "lucide-react";

const nav = [
  { to: "/workspace", label: "Dashboard", icon: LayoutDashboard },
  { to: "/targets", label: "Targets", icon: Target },
  { to: "/scans", label: "Scans", icon: Radar },
  { to: "/findings", label: "Vulnerabilities", icon: ShieldAlert },
  { to: "/testing", label: "Testing", icon: FlaskConical },
  { to: "/agent", label: "AI Agent", icon: Bot },
  { to: "/programs", label: "Programs", icon: Trophy },
  { to: "/reports", label: "Reports", icon: FileText },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  const isActive = (to: string) => {
    if (to === "/workspace") return pathname === "/" || pathname === "/workspace";
    return pathname.startsWith(to);
  };

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocusCapture={() => setExpanded(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setExpanded(false);
        }}
        className={`glass-sidebar fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden transition-[width,box-shadow] duration-300 ease-out motion-reduce:transition-none ${
          expanded
            ? "w-64 shadow-2xl shadow-black/40 ring-1 ring-border-strong/40"
            : "w-16"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent ring-1 ring-accent/30">
            <Terminal className="h-4 w-4" />
          </div>
          <div
            className={`flex flex-col leading-tight whitespace-nowrap transition-all duration-200 ease-out motion-reduce:transition-none ${
              expanded ? "opacity-100 translate-x-0 delay-75" : "opacity-0 -translate-x-2 pointer-events-none"
            }`}
          >
            <span className="text-sm font-semibold tracking-tight text-white">RekonStrike</span>
            <span className="label-eyebrow">recon framework</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-4">
          <ul className="space-y-1">
            {nav.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    href={item.to}
                    className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-accent/15 text-white ring-1 ring-accent/30"
                        : "text-muted hover:bg-white/5 hover:text-white"
                    }`}
                    title={!expanded ? item.label : undefined}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-accent" : "text-dim group-hover:text-accent"
                      }`}
                    />
                    <span
                      className={`truncate whitespace-nowrap transition-all duration-200 ease-out motion-reduce:transition-none ${
                        expanded
                          ? "opacity-100 translate-x-0 delay-75"
                          : "opacity-0 -translate-x-2 pointer-events-none"
                      }`}
                    >
                      {item.label}
                    </span>
                    {active && (
                      <span
                        className={`ml-auto h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px] shadow-accent transition-opacity duration-200 motion-reduce:transition-none ${
                          expanded ? "opacity-100 delay-100" : "opacity-0"
                        }`}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-h-screen flex-col pl-16">
        <header className="glass-header sticky top-0 z-30 flex h-16 items-center gap-4 px-6">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
            <input
              type="text"
              placeholder="Search targets, vulns, sessions…"
              className="h-9 w-full rounded-md border border-border bg-surface/60 pl-9 pr-3 text-sm placeholder:text-dim focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
            <kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-dim md:inline-block">
              ⌘K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border bg-surface/60 px-3 py-1.5 text-xs text-muted md:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green" />
              </span>
              <span className="mono">api: localhost:8000</span>
            </div>
            <Link
              href="/workspace"
              className="rounded-md border border-border bg-surface/60 p-2 text-muted hover:text-white transition-colors"
            >
              <Activity className="h-4 w-4" />
            </Link>
            <button className="rounded-md border border-border bg-surface/60 p-2 text-muted hover:text-white transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-glow text-xs font-bold text-white">
              OP
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
