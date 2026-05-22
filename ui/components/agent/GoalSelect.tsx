"use client";

const GOAL_PRESETS = [
  { value: "subdomain_takeover", label: "Subdomain takeover sweep" },
  { value: "graphql_authz", label: "GraphQL authorization testing" },
  { value: "ssrf_redirect", label: "Open redirect & SSRF" },
  { value: "custom", label: "Custom" },
] as const;

export type GoalPresetValue = (typeof GOAL_PRESETS)[number]["value"];

const GOAL_MAP: Record<string, string> = {
  subdomain_takeover: "Find subdomain takeover candidates and verify dangling DNS / unclaimed services.",
  graphql_authz: "Discover GraphQL endpoints and test for authorization bypass, IDOR, and field-level access issues.",
  ssrf_redirect: "Hunt open redirects and SSRF vectors across discovered live hosts and parameters.",
  custom: "",
};

export function resolveGoal(preset: GoalPresetValue, custom: string): string {
  if (preset === "custom") return custom.trim();
  return GOAL_MAP[preset] ?? "";
}

export function GoalSelect({
  preset,
  custom,
  onChange,
}: {
  preset: GoalPresetValue;
  custom: string;
  onChange: (preset: GoalPresetValue, custom: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {GOAL_PRESETS.map((p) => {
          const active = p.value === preset;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value, custom)}
              className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                active
                  ? "border-accent bg-accent/10 text-white"
                  : "border-border bg-bg text-muted hover:border-border-strong hover:text-white"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === "custom" && (
        <textarea
          value={custom}
          onChange={(e) => onChange(preset, e.target.value)}
          rows={3}
          placeholder="Describe what the agent should hunt for…"
          className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-white placeholder:text-dim focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      )}
    </div>
  );
}
