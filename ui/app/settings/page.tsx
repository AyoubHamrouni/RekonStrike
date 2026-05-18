"use client";

import { useState, useEffect } from "react";
import { Settings, Key, Database, Bell, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/Shared";
import { Tabs } from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";

const SETTINGS_KEY = "rekonstrike-settings";

interface AppSettings {
  instanceName: string;
  defaultTarget: string;
  anthropicKey: string;
  openaiKey: string;
  googleKey: string;
  hackeroneKey: string;
  bugcrowdKey: string;
  intigritiKey: string;
  webhookUrl: string;
  slackWebhook: string;
}

const defaultSettings: AppSettings = {
  instanceName: "RekonStrike",
  defaultTarget: "",
  anthropicKey: "",
  openaiKey: "",
  googleKey: "",
  hackeroneKey: "",
  bugcrowdKey: "",
  intigritiKey: "",
  webhookUrl: "",
  slackWebhook: "",
};

const tabs = [
  { id: "general", label: "General", icon: <Settings size={14} /> },
  { id: "api-keys", label: "API Keys", icon: <Key size={14} /> },
  { id: "integrations", label: "Integrations", icon: <Database size={14} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={14} /> },
];

function SaveIndicator({ saved }: { saved: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-opacity ${
        saved ? "opacity-100 text-emerald-400" : "opacity-0"
      }`}
    >
      <CheckCircle size={10} />
      Saved
    </span>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-900/50 border border-white/5 rounded-lg px-3 py-2 pr-16 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-600/40 transition-all font-mono"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <p className="text-[10px] text-slate-600">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        setSettings({ ...defaultSettings, ...JSON.parse(stored) });
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  const update = (key: keyof AppSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      setSaved(true);
      toast.success("Settings saved");
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Failed to save settings");
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Settings size={20} className="text-purple-500" />
            Settings
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure your RekonStrike instance
          </p>
        </div>
        <SaveIndicator saved={saved} />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "general" && (
        <Card
          title="General Settings"
          action={
            <Button variant="primary" size="sm" onClick={save}>
              Save
            </Button>
          }
        >
          <div className="space-y-4">
            <Input
              label="Instance Name"
              placeholder="RekonStrike"
              value={settings.instanceName}
              onChange={(e) => update("instanceName", e.target.value)}
            />
            <Input
              label="Default Target"
              placeholder="example.com"
              value={settings.defaultTarget}
              onChange={(e) => update("defaultTarget", e.target.value)}
              hint="Used as the default target in the topbar"
            />
          </div>
        </Card>
      )}

      {activeTab === "api-keys" && (
        <Card
          title="AI Provider API Keys"
          action={
            <Button variant="primary" size="sm" onClick={save}>
              Save Keys
            </Button>
          }
        >
          <div className="space-y-4">
            <PasswordInput
              label="Anthropic API Key"
              value={settings.anthropicKey}
              onChange={(v) => update("anthropicKey", v)}
              placeholder="sk-ant-..."
              hint="Used for AI strategist/triager agent"
            />
            <PasswordInput
              label="OpenAI API Key"
              value={settings.openaiKey}
              onChange={(v) => update("openaiKey", v)}
              placeholder="sk-..."
              hint="Alternative AI provider"
            />
            <PasswordInput
              label="Google AI Key"
              value={settings.googleKey}
              onChange={(v) => update("googleKey", v)}
              placeholder="AIza..."
              hint="Alternative AI provider"
            />
          </div>
        </Card>
      )}

      {activeTab === "integrations" && (
        <Card
          title="Platform Integrations"
          action={
            <Button variant="primary" size="sm" onClick={save}>
              Save Integrations
            </Button>
          }
        >
          <div className="space-y-4">
            <PasswordInput
              label="HackerOne API Key"
              value={settings.hackeroneKey}
              onChange={(v) => update("hackeroneKey", v)}
            />
            <PasswordInput
              label="Bugcrowd API Key"
              value={settings.bugcrowdKey}
              onChange={(v) => update("bugcrowdKey", v)}
            />
            <PasswordInput
              label="Intigriti API Key"
              value={settings.intigritiKey}
              onChange={(v) => update("intigritiKey", v)}
            />
          </div>
        </Card>
      )}

      {activeTab === "notifications" && (
        <Card
          title="Notification Preferences"
          action={
            <Button variant="primary" size="sm" onClick={save}>
              Save
            </Button>
          }
        >
          <div className="space-y-4">
            <Input
              label="Webhook URL"
              placeholder="https://hooks.example.com/..."
              value={settings.webhookUrl}
              onChange={(e) => update("webhookUrl", e.target.value)}
              hint="Receive scan completion notifications"
            />
            <Input
              label="Slack Webhook"
              placeholder="https://hooks.slack.com/..."
              value={settings.slackWebhook}
              onChange={(e) => update("slackWebhook", e.target.value)}
              hint="Post recon summaries to a Slack channel"
            />
          </div>
        </Card>
      )}
    </div>
  );
}
