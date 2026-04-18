import React, { useEffect, useState, useCallback } from "react";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import Badge from "@cloudscape-design/components/badge";
import Button from "@cloudscape-design/components/button";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Input from "@cloudscape-design/components/input";
import FormField from "@cloudscape-design/components/form-field";
import Spinner from "@cloudscape-design/components/spinner";

function prettify(name) {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function secretToEnvVar(secret) {
  return `COSI_SECRET_${secret.replace(/[\/\-]/g, "_").toUpperCase()}`;
}

function secretLabel(secret) {
  const part = secret.split("/").slice(1).join("/") || secret;
  return prettify(part);
}

function isPasswordField(secret) {
  return /key|secret|token|password|credential|private/i.test(secret);
}

function CredentialForm({ secrets, configured, onSaved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  if (!secrets?.length) return null;

  async function save() {
    setSaving(true);
    for (const secret of secrets) {
      const envVar = secretToEnvVar(secret);
      const val = values[envVar];
      if (val) {
        await fetch("/api/secrets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: envVar, value: val }),
        });
      }
    }
    setSaving(false);
    setValues({});
    onSaved();
  }

  const hasAnyValue = Object.values(values).some((v) => v);

  return (
    <ExpandableSection headerText="Credentials">
      <SpaceBetween size="s">
        {secrets.map((secret) => {
          const envVar = secretToEnvVar(secret);
          const isSet = configured.has(envVar);
          return (
            <FormField
              key={secret}
              label={
                <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                  <span>{secretLabel(secret)}</span>
                  {isSet && <Badge color="green">configured</Badge>}
                </SpaceBetween>
              }
            >
              <Input
                type={isPasswordField(secret) ? "password" : "text"}
                placeholder={isSet ? "Leave blank to keep existing value" : `Enter ${secretLabel(secret).toLowerCase()}`}
                value={values[envVar] || ""}
                onChange={({ detail }) =>
                  setValues((prev) => ({ ...prev, [envVar]: detail.value }))
                }
              />
            </FormField>
          );
        })}
        <Button variant="primary" loading={saving} disabled={!hasAnyValue} onClick={save}>
          Save credentials
        </Button>
      </SpaceBetween>
    </ExpandableSection>
  );
}

function CositaCard({ cosita, configured, onSaved, onToggle, toggling }) {
  const isActive = cosita.enabled;

  return (
    <Container
      header={
        <Header
          variant="h3"
          actions={
            <Button
              variant={isActive ? "link" : "primary"}
              loading={toggling}
              onClick={() => onToggle(cosita.name, !isActive)}
            >
              {isActive ? "Disable" : "Enable"}
            </Button>
          }
        >
          <SpaceBetween direction="horizontal" size="s" alignItems="center">
            <span>{prettify(cosita.name)}</span>
            {isActive ? (
              <StatusIndicator type={cosita.healthy ? "success" : "error"}>
                {cosita.healthy ? "online" : "offline"}
              </StatusIndicator>
            ) : (
              <Badge color="grey">disabled</Badge>
            )}
          </SpaceBetween>
        </Header>
      }
    >
      <SpaceBetween size="m">
        {cosita.description && (
          <Box color="text-body-secondary" variant="small">
            {cosita.description}
          </Box>
        )}

        {cosita.tools?.length > 0 && (
          <SpaceBetween direction="horizontal" size="xs">
            {cosita.tools.slice(0, 8).map((t) => (
              <Badge key={t.name} color="blue">
                {t.name}
              </Badge>
            ))}
            {cosita.tools.length > 8 && (
              <Badge color="grey">+{cosita.tools.length - 8} more</Badge>
            )}
          </SpaceBetween>
        )}

        <CredentialForm
          secrets={cosita.secrets}
          configured={configured}
          onSaved={onSaved}
        />
      </SpaceBetween>
    </Container>
  );
}

export default function Cositas() {
  const [allTools, setAllTools] = useState([]);
  const [configured, setConfigured] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [togglingTool, setTogglingTool] = useState(null);

  const loadConfigured = useCallback(async () => {
    try {
      const res = await fetch("/api/secrets");
      if (res.ok) {
        const { secrets } = await res.json();
        setConfigured(new Set(secrets));
      }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [libraryRes, toolsRes] = await Promise.all([
        fetch("/api/library"),
        fetch("/api/tools"),
      ]);

      const healthMap = {};
      if (toolsRes.ok) {
        const { tools } = await toolsRes.json();
        for (const t of tools) {
          const name = (t.serviceName || "").replace(/^tool-/, "");
          if (name) healthMap[name] = (healthMap[name] || false) || t.healthy;
        }
      }

      if (libraryRes.ok) {
        const { tools } = await libraryRes.json();
        setAllTools(tools.map((t) => ({ ...t, healthy: healthMap[t.name] ?? false })));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadConfigured();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load, loadConfigured]);

  async function toggleTool(name, enable) {
    setTogglingTool(name);
    try {
      await fetch(`/api/library/${name}/${enable ? "enable" : "disable"}`, { method: "POST" });
      await load();
    } finally {
      setTogglingTool(null);
    }
  }

  const activeCositas = allTools.filter((t) => t.enabled);
  const libraryTools = allTools.filter((t) => !t.enabled);

  if (loading && allTools.length === 0) {
    return (
      <Box padding="l" textAlign="center">
        <Spinner />
      </Box>
    );
  }

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        {/* ── Active cositas ── */}
        <SpaceBetween size="m">
          <Header
            variant="h2"
            counter={activeCositas.length ? `(${activeCositas.length})` : undefined}
            actions={<Button iconName="refresh" variant="icon" onClick={load} />}
          >
            Active Cositas
          </Header>

          {activeCositas.length === 0 ? (
            <Box textAlign="center" padding="xxl" color="text-body-secondary">
              No active cositas — enable one from the library below or ask Cosi to build a new one.
            </Box>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
                gap: "20px",
              }}
            >
              {activeCositas.map((cosita) => (
                <CositaCard
                  key={cosita.name}
                  cosita={cosita}
                  configured={configured}
                  onSaved={loadConfigured}
                  onToggle={toggleTool}
                  toggling={togglingTool === cosita.name}
                />
              ))}
            </div>
          )}
        </SpaceBetween>

        {/* ── Tool library ── */}
        {libraryTools.length > 0 && (
          <SpaceBetween size="m">
            <Header variant="h2" counter={`(${libraryTools.length})`}>
              Tool Library
            </Header>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
                gap: "20px",
              }}
            >
              {libraryTools.map((cosita) => (
                <CositaCard
                  key={cosita.name}
                  cosita={cosita}
                  configured={configured}
                  onSaved={loadConfigured}
                  onToggle={toggleTool}
                  toggling={togglingTool === cosita.name}
                />
              ))}
            </div>
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Box>
  );
}
