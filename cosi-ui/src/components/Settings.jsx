import React, { useState, useEffect, useCallback } from "react";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Toggle from "@cloudscape-design/components/toggle";
import Button from "@cloudscape-design/components/button";
import Badge from "@cloudscape-design/components/badge";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import { useSettings } from "../hooks/useSettings.js";

// ── Static option lists ──────────────────────────────────────────────────────

const PROVIDERS = [
  { value: "bedrock",      label: "AWS Bedrock" },
  { value: "anthropic",    label: "Anthropic API" },
  { value: "azure-openai", label: "Azure OpenAI" },
  { value: "vertex",       label: "Google Vertex AI" },
  { value: "oci",          label: "OCI Generative AI" },
];

const AWS_REGIONS = [
  { label: "us-east-1 — US East (N. Virginia)",   value: "us-east-1" },
  { label: "us-east-2 — US East (Ohio)",          value: "us-east-2" },
  { label: "us-west-1 — US West (N. California)", value: "us-west-1" },
  { label: "us-west-2 — US West (Oregon)",        value: "us-west-2" },
  { label: "eu-west-1 — EU (Ireland)",            value: "eu-west-1" },
  { label: "eu-west-2 — EU (London)",             value: "eu-west-2" },
  { label: "eu-central-1 — EU (Frankfurt)",       value: "eu-central-1" },
  { label: "eu-north-1 — EU (Stockholm)",         value: "eu-north-1" },
  { label: "ap-northeast-1 — AP (Tokyo)",         value: "ap-northeast-1" },
  { label: "ap-southeast-1 — AP (Singapore)",     value: "ap-southeast-1" },
  { label: "ap-southeast-2 — AP (Sydney)",        value: "ap-southeast-2" },
  { label: "ap-south-1 — AP (Mumbai)",            value: "ap-south-1" },
  { label: "ca-central-1 — CA (Central)",         value: "ca-central-1" },
  { label: "sa-east-1 — SA (São Paulo)",          value: "sa-east-1" },
];

const GOVCLOUD_REGIONS = [
  { label: "us-gov-west-1 — US GovCloud (West)", value: "us-gov-west-1" },
  { label: "us-gov-east-1 — US GovCloud (East)", value: "us-gov-east-1" },
];

const BEDROCK_MODELS = [
  { label: "Claude Sonnet 4.6",    value: "us.anthropic.claude-sonnet-4-6" },
  { label: "Claude Opus 4.7",      value: "us.anthropic.claude-opus-4-7" },
  { label: "Claude Haiku 4.5",     value: "us.anthropic.claude-haiku-4-5-20251001" },
  { label: "Claude Sonnet 3.7",    value: "us.anthropic.claude-3-7-sonnet-20250219-v1:0" },
  { label: "Claude Sonnet 3.5 v2", value: "us.anthropic.claude-3-5-sonnet-20241022-v2:0" },
  { label: "Amazon Nova Pro",      value: "us.amazon.nova-pro-v1:0" },
  { label: "Amazon Nova Lite",     value: "us.amazon.nova-lite-v1:0" },
  { label: "Amazon Nova Micro",    value: "us.amazon.nova-micro-v1:0" },
];

const ANTHROPIC_MODELS = [
  { label: "Claude Sonnet 4.6", value: "claude-sonnet-4-6" },
  { label: "Claude Opus 4.7",   value: "claude-opus-4-7" },
  { label: "Claude Haiku 4.5",  value: "claude-haiku-4-5-20251001" },
  { label: "Claude Sonnet 3.7", value: "claude-3-7-sonnet-20250219" },
  { label: "Claude Sonnet 3.5", value: "claude-3-5-sonnet-20241022" },
];

const VERTEX_MODELS = [
  { label: "Gemini 2.0 Flash",         value: "gemini-2.0-flash" },
  { label: "Gemini 2.0 Flash-Lite",    value: "gemini-2.0-flash-lite" },
  { label: "Gemini 2.5 Flash Preview", value: "gemini-2.5-flash-preview-05-20" },
  { label: "Gemini 1.5 Pro",           value: "gemini-1.5-pro" },
  { label: "Gemini 1.5 Flash",         value: "gemini-1.5-flash" },
];

const OCI_MODELS = [
  { label: "Meta Llama 3.3 70B Instruct",  value: "meta.llama-3.3-70b-instruct" },
  { label: "Meta Llama 3.1 405B Instruct", value: "meta.llama-3.1-405b-instruct" },
  { label: "Meta Llama 3.1 70B Instruct",  value: "meta.llama-3.1-70b-instruct" },
  { label: "Cohere Command R+",            value: "cohere.command-r-plus-08-2024" },
  { label: "Cohere Command R",             value: "cohere.command-r-08-2024" },
];

// ── Credential helpers ────────────────────────────────────────────────────────

function useConfigured() {
  const [configured, setConfigured] = useState(new Set());

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/secrets");
      if (res.ok) {
        const { secrets } = await res.json();
        setConfigured(new Set(secrets));
      }
    } catch {}
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { configured, reload };
}

function CredentialField({ label, envVar, type = "password", configured, value, onChange }) {
  return (
    <FormField
      label={
        <SpaceBetween direction="horizontal" size="xs" alignItems="center">
          <span>{label}</span>
          {configured.has(envVar) && <Badge color="green">configured</Badge>}
        </SpaceBetween>
      }
    >
      <Input
        type={type}
        placeholder={configured.has(envVar) ? "Leave blank to keep existing value" : `Enter ${label.toLowerCase()}`}
        value={value || ""}
        onChange={({ detail }) => onChange(detail.value)}
      />
    </FormField>
  );
}

function CredentialSection({ fields, configured, onSaved }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const hasAny = Object.values(values).some(Boolean);

  async function handleSave() {
    setSaving(true);
    for (const { envVar } of fields) {
      if (values[envVar]) {
        await fetch("/api/secrets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: envVar, value: values[envVar] }),
        });
      }
    }
    setSaving(false);
    setValues({});
    onSaved();
  }

  return (
    <ExpandableSection headerText="Credentials">
      <SpaceBetween size="s">
        {fields.map(({ label, envVar, type }) => (
          <CredentialField
            key={envVar}
            label={label}
            envVar={envVar}
            type={type || "password"}
            configured={configured}
            value={values[envVar]}
            onChange={(v) => setValues((prev) => ({ ...prev, [envVar]: v }))}
          />
        ))}
        <Button variant="primary" loading={saving} disabled={!hasAny} onClick={handleSave}>
          Save credentials
        </Button>
      </SpaceBetween>
    </ExpandableSection>
  );
}

// ── Per-provider panels ───────────────────────────────────────────────────────

function BedrockPanel({ settings, update }) {
  const regionOptions = settings.awsGovCloud ? GOVCLOUD_REGIONS : AWS_REGIONS;
  const selectedRegion = regionOptions.find((r) => r.value === settings.awsRegion) || regionOptions[0];
  const selectedModel  = BEDROCK_MODELS.find((m) => m.value === settings.bedrockModelId) || BEDROCK_MODELS[0];

  return (
    <SpaceBetween size="m">
      <FormField label="AWS GovCloud">
        <Toggle
          checked={settings.awsGovCloud}
          onChange={({ detail }) => {
            update("awsGovCloud", detail.checked);
            const regions = detail.checked ? GOVCLOUD_REGIONS : AWS_REGIONS;
            update("awsRegion", regions[0].value);
          }}
        >
          Use GovCloud
        </Toggle>
      </FormField>

      <FormField label="Region">
        <Select
          selectedOption={selectedRegion}
          onChange={({ detail }) => update("awsRegion", detail.selectedOption.value)}
          options={regionOptions}
        />
      </FormField>

      <FormField label="Model">
        <Select
          selectedOption={selectedModel}
          onChange={({ detail }) => update("bedrockModelId", detail.selectedOption.value)}
          options={BEDROCK_MODELS}
        />
      </FormField>

      <Box color="text-body-secondary" variant="small">
        Authenticates via the container's IAM role or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment variables.
      </Box>
    </SpaceBetween>
  );
}

function AnthropicPanel({ settings, update, configured, onSaved }) {
  const selectedModel = ANTHROPIC_MODELS.find((m) => m.value === settings.anthropicModelId) || ANTHROPIC_MODELS[0];

  return (
    <SpaceBetween size="m">
      <FormField label="Model">
        <Select
          selectedOption={selectedModel}
          onChange={({ detail }) => update("anthropicModelId", detail.selectedOption.value)}
          options={ANTHROPIC_MODELS}
        />
      </FormField>
      <CredentialSection
        fields={[{ label: "API Key", envVar: "COSI_SECRET_AI_ANTHROPIC_API_KEY" }]}
        configured={configured}
        onSaved={onSaved}
      />
    </SpaceBetween>
  );
}

function AzurePanel({ settings, update, configured, onSaved }) {
  return (
    <SpaceBetween size="m">
      <FormField label="Endpoint" description="e.g. https://my-resource.openai.azure.com">
        <Input
          value={settings.azureOpenAiEndpoint}
          onChange={({ detail }) => update("azureOpenAiEndpoint", detail.value)}
          placeholder="https://my-resource.openai.azure.com"
        />
      </FormField>

      <FormField label="Deployment" description="The deployment name configured in Azure AI Foundry">
        <Input
          value={settings.azureOpenAiDeployment}
          onChange={({ detail }) => update("azureOpenAiDeployment", detail.value)}
          placeholder="gpt-4o"
        />
      </FormField>

      <FormField label="API Version">
        <Input
          value={settings.azureOpenAiApiVersion}
          onChange={({ detail }) => update("azureOpenAiApiVersion", detail.value)}
          placeholder="2025-01-01-preview"
        />
      </FormField>

      <CredentialSection
        fields={[{ label: "API Key", envVar: "COSI_SECRET_AI_AZURE_API_KEY" }]}
        configured={configured}
        onSaved={onSaved}
      />
    </SpaceBetween>
  );
}

function VertexPanel({ settings, update, configured, onSaved }) {
  const selectedModel = VERTEX_MODELS.find((m) => m.value === settings.vertexModelId) || VERTEX_MODELS[0];

  return (
    <SpaceBetween size="m">
      <FormField label="Model">
        <Select
          selectedOption={selectedModel}
          onChange={({ detail }) => update("vertexModelId", detail.selectedOption.value)}
          options={VERTEX_MODELS}
        />
      </FormField>

      <CredentialSection
        fields={[{ label: "Google AI API Key", envVar: "COSI_SECRET_AI_VERTEX_API_KEY" }]}
        configured={configured}
        onSaved={onSaved}
      />

      <Box color="text-body-secondary" variant="small">
        Get a free API key from Google AI Studio (aistudio.google.com). Uses the Gemini OpenAI-compatible endpoint.
      </Box>
    </SpaceBetween>
  );
}

function OciPanel({ settings, update, configured, onSaved }) {
  const selectedModel = OCI_MODELS.find((m) => m.value === settings.ociModelId) || OCI_MODELS[0];

  return (
    <SpaceBetween size="m">
      <FormField label="Endpoint URL">
        <Input
          value={settings.ociGenAiEndpoint}
          onChange={({ detail }) => update("ociGenAiEndpoint", detail.value)}
          placeholder="https://inference.generativeai.us-chicago-1.oci.oraclecloud.com"
        />
      </FormField>

      <FormField label="Compartment OCID">
        <Input
          value={settings.ociCompartmentId}
          onChange={({ detail }) => update("ociCompartmentId", detail.value)}
          placeholder="ocid1.compartment.oc1.."
        />
      </FormField>

      <FormField label="Model">
        <Select
          selectedOption={selectedModel}
          onChange={({ detail }) => update("ociModelId", detail.selectedOption.value)}
          options={OCI_MODELS}
        />
      </FormField>

      <CredentialSection
        fields={[
          { label: "Tenancy OCID",  envVar: "COSI_SECRET_AI_OCI_TENANCY_OCID",  type: "text" },
          { label: "User OCID",     envVar: "COSI_SECRET_AI_OCI_USER_OCID",     type: "text" },
          { label: "Fingerprint",   envVar: "COSI_SECRET_AI_OCI_FINGERPRINT",   type: "text" },
          { label: "Private Key",   envVar: "COSI_SECRET_AI_OCI_PRIVATE_KEY" },
        ]}
        configured={configured}
        onSaved={onSaved}
      />
    </SpaceBetween>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

const PROVIDER_PANELS = {
  bedrock:      (props) => <BedrockPanel      {...props} />,
  anthropic:    (props) => <AnthropicPanel    {...props} />,
  "azure-openai": (props) => <AzurePanel      {...props} />,
  vertex:       (props) => <VertexPanel       {...props} />,
  oci:          (props) => <OciPanel          {...props} />,
};

export default function Settings() {
  const { settings, loading, saving, error, saveSuccess, saveSettings } = useSettings();
  const { configured, reload: reloadConfigured } = useConfigured();
  const [local, setLocal] = useState(settings);

  useEffect(() => { setLocal(settings); }, [settings]);

  const update = (key, value) => setLocal((prev) => ({ ...prev, [key]: value }));
  const selectedProvider = PROVIDERS.find((p) => p.value === local.aiProvider) || PROVIDERS[0];
  const PanelComponent = PROVIDER_PANELS[local.aiProvider] || PROVIDER_PANELS.bedrock;

  if (loading) {
    return (
      <Box padding="l">
        <StatusIndicator type="loading">Loading settings…</StatusIndicator>
      </Box>
    );
  }

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h1">Settings</Header>

        {/* AI Configuration */}
        <Container header={<Header variant="h2">AI Configuration</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Provider"
              description="AI service used for Cosi chat and tool generation"
            >
              <Select
                selectedOption={selectedProvider}
                onChange={({ detail }) => update("aiProvider", detail.selectedOption.value)}
                options={PROVIDERS}
              />
            </FormField>

            <PanelComponent
              settings={local}
              update={update}
              configured={configured}
              onSaved={reloadConfigured}
            />
          </SpaceBetween>
        </Container>

        {/* Git Configuration */}
        <Container header={<Header variant="h2">Git Configuration</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Repository URL"
              description="Repository where Cosi commits generated tools"
            >
              <Input
                value={local.gitRepoUrl}
                onChange={({ detail }) => update("gitRepoUrl", detail.value)}
                placeholder="https://github.com/your-org/cosi-tools.git"
              />
            </FormField>

            <FormField label="Branch">
              <Input
                value={local.gitBranch}
                onChange={({ detail }) => update("gitBranch", detail.value)}
                placeholder="main"
              />
            </FormField>
          </SpaceBetween>
        </Container>

        {/* Save */}
        <SpaceBetween direction="horizontal" size="s" alignItems="center">
          <Button variant="primary" onClick={() => saveSettings(local)} loading={saving}>
            Save settings
          </Button>
          {saveSuccess && <StatusIndicator type="success">Saved</StatusIndicator>}
          {error      && <StatusIndicator type="error">{error}</StatusIndicator>}
        </SpaceBetween>
      </SpaceBetween>
    </Box>
  );
}
