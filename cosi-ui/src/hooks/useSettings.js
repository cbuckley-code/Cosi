import { useState, useEffect, useCallback } from "react";

const DEFAULT_SETTINGS = {
  storageMode: "git",
  gitRepoUrl: "",
  gitBranch: "main",
  awsRegion: "us-west-2",
  awsGovCloud: false,
  bedrockModelId: "us.anthropic.claude-sonnet-4-6",
};

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSettings({ ...DEFAULT_SETTINGS, ...data });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async (newSettings) => {
    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSettings(newSettings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    loading,
    saving,
    error,
    saveSuccess,
    saveSettings,
    reloadSettings: loadSettings,
  };
}
