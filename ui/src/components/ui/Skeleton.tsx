interface SkeletonLineProps {
  className?: string;
}

export function SkeletonLine({ className = "" }: SkeletonLineProps) {
  return <div className={`skeleton h-4 rounded ${className}`} />;
}

interface SkeletonCardProps {
  lines?: number;
  className?: string;
}

export function SkeletonCard({ lines = 3, className = "" }: SkeletonCardProps) {
  return (
    <div className={`bg-surface border border-white/5 rounded-xl p-4 ${className}`}>
      <div className="skeleton h-10 w-10 rounded-lg mb-3" />
      <div className="skeleton h-8 w-20 mb-2" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton h-3 rounded"
            style={{ width: `${60 + i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
}

export function SkeletonTable({ rows = 5, cols = 4 }: SkeletonTableProps) {
  return (
    <div className="bg-surface border border-white/5 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5">
        <div className="skeleton h-5 w-32 rounded" />
      </div>
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-5 py-3.5 flex items-center gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="skeleton h-4 rounded flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SkeletonPhaseTimelineProps {
  phases?: number;
}

export function SkeletonPhaseTimeline({ phases = 7 }: SkeletonPhaseTimelineProps) {
  return (
    <div className="bg-surface border border-white/5 rounded-xl p-5">
      <div className="skeleton h-4 w-28 rounded mb-4" />
      <div className="space-y-2">
        {Array.from({ length: phases }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="skeleton w-7 h-7 rounded-full shrink-0" />
            <div className="flex-1 pt-1 space-y-1">
              <div className="skeleton h-4 w-40 rounded" />
              {i < phases - 1 && <div className="skeleton h-0.5 w-0.5 ml-3.5" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
