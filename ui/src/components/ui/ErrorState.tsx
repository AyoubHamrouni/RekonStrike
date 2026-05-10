import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-red-subtle border border-red/20 flex items-center justify-center mb-4">
        <AlertTriangle size={24} className="text-red" />
      </div>
      <h3 className="text-base font-semibold text-text mb-1.5">{title}</h3>
      {message && <p className="text-sm text-text-dim max-w-md mb-5">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-border text-text rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}
