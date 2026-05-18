import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import AppShell from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "RekonStrike — Advanced Reconnaissance Platform",
  description:
    "Offensive security reconnaissance framework with AI-driven strategist/triager agent. Automate bug bounty recon, threat modeling, and attack surface mapping.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
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
              boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            },
          }}
        />
        <ErrorBoundary>
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
      </body>
    </html>
  );
}
