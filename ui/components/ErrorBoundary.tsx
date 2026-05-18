"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center py-24 px-6 animate-fade-in"
        >
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-6 text-rose-400">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-sm font-bold text-slate-300 mb-2">
            Unexpected Error
          </h2>
          <p className="text-xs text-slate-500 max-w-md text-center mb-2 font-mono">
            {this.state.error?.message || "Something went wrong"}
          </p>
          <p className="text-[10px] text-slate-600 max-w-md text-center mb-8">
            Check the console for more details.
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={this.handleRetry}
          >
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
