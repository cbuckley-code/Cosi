import React, { useState, useEffect } from "react";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import Toggle from "@cloudscape-design/components/toggle";
import Button from "@cloudscape-design/components/button";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import { useSettings } from "../hooks/useSettings.js";

const AWS_REGIONS = [
  { label: "US East (N. Virginia) — us-east-1", value: "us-east-1" },
  { label: "US East (Ohio) — us-east-2", value: "us-east-2" },
  { label: "US West (N. California) — us-west-1", value: "us-west-1" },
  { label: "US West (Oregon) — us-west-2", value: "us-west-2" },
  { label: "EU (Ireland) — eu-west-1", value: "eu-west-1" },
  { label: "EU (London) — eu-west-2", value: "eu-west-2" },
  { label: "EU (Frankfurt) — eu-central-1", value: "eu-central-1" },
  { label: "EU (Stockholm) — eu-north-1", value: "eu-north-1" },
  { label: "AP (Tokyo) — ap-northeast-1", value: "ap-northeast-1" },
  { label: "AP (Singapore) — ap-southeast-1", value: "ap-southeast-1" },
  { label: "AP (Sydney) — ap-southeast-2", value: "ap-southeast-2" },
  { label: "AP (Mumbai) — ap-south-1", value: "ap-south-1" },
  { label: "CA (Central) — ca-central-1", value: "ca-central-1" },
  { label: "SA (São Paulo) — sa-east-1", value: "sa-east-1" },
];

const GOVCLOUD_REGIONS = [
  { label: "US GovCloud (West) — us-gov-west-1", value: "us-gov-west-1" },
  { label: "US GovCloud (East) — us-gov-east-1", value: "us-gov-east-1" },
];

const BEDROCK_MODELS = [
  {
    label: "Claude Sonnet 4.6 (us.anthropic.claude-sonnet-4-6)",
    value: "us.anthropic.claude-sonnet-4-6",
  },
  {
    label: "Claude Opus 4.7 (us.anthropic.claude-opus-4-7)",
    value: "us.anthropic.claude-opus-4-7",
  },
  {
    label: "Claude Haiku 4.5 (us.anthropic.claude-haiku-4-5)",
    value: "us.anthropic.claude-haiku-4-5",
  },
  {
    label: "Amazon Nova Pro (amazon.nova-pro-v1:0)",
    value: "amazon.nova-pro-v1:0",
  },
  {
    label: "Amazon Nova Lite (amazon.nova-lite-v1:0)",
    value: "amazon.nova-lite-v1:0",
  },
];

export default function Settings() {
  const { settings, loading, saving, error, saveSuccess, saveSettings } =
    useSettings();

  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const regionOptions = localSettings.awsGovCloud
    ? GOVCLOUD_REGIONS
    : AWS_REGIONS;

  const selectedRegion =
    regionOptions.find((r) => r.value === localSettings.awsRegion) ||
    regionOptions[0];

  const selectedModel =
    BEDROCK_MODELS.find((m) => m.value === localSettings.bedrockModelId) ||
    BEDROCK_MODELS[0];

  const handleSave = () => {
    saveSettings(localSettings);
  };

  const update = (key, value) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Box padding="l">
        <StatusIndicator type="loading">Loading settings...</StatusIndicator>
      </Box>
    );
  }

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h1">Settings</Header>

        <Container header={<Header variant="h2">Storage</Header>}>
          <SpaceBetween size="m">
            <FormField
              label="Storage mode"
              description="Git mode commits generated tools to a repository so they are versioned and portable. Filesystem mode writes tools directly to disk — simpler, no git setup required."
            >
              <Select
                selectedOption={
                  localSettings.storageMode === "filesystem"
                    ? { label: "Filesystem", value: "filesystem" }
                    : { label: "Git", value: "git" }
                }
                onChange={({ detail }) => update("storageMode", detail.selectedOption.value)}
                options={[
                  { label: "Git", value: "git" },
                  { label: "Filesystem", value: "filesystem" },
                ]}
              />
            </FormField>

            {localSettings.storageMode !== "filesystem" && (
              <>
                <FormField label="Git Repository URL" description="The repository Cosi commits generated tools to">
                  <Input
                    value={localSettings.gitRepoUrl}
                    onChange={({ detail }) => update("gitRepoUrl", detail.value)}
                    placeholder="https://github.com/your-org/cosi-tools.git"
                  />
                </FormField>

                <FormField label="Git Branch">
                  <Input
                    value={localSettings.gitBranch}
                    onChange={({ detail }) => update("gitBranch", detail.value)}
                    placeholder="main"
                  />
                </FormField>
              </>
            )}
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Bedrock Configuration</Header>}>
          <SpaceBetween size="m">
            <FormField label="AWS GovCloud" description="Enable to use AWS GovCloud regions">
              <Toggle
                checked={localSettings.awsGovCloud}
                onChange={({ detail }) => {
                  update("awsGovCloud", detail.checked);
                  const regions = detail.checked ? GOVCLOUD_REGIONS : AWS_REGIONS;
                  update("awsRegion", regions[0].value);
                }}
              >
                Use GovCloud
              </Toggle>
            </FormField>

            <FormField label="AWS Region">
              <Select
                selectedOption={selectedRegion}
                onChange={({ detail }) =>
                  update("awsRegion", detail.selectedOption.value)
                }
                options={regionOptions}
              />
            </FormField>

            <FormField
              label="Bedrock Model"
              description="The LLM model used for chat and tool generation"
            >
              <Select
                selectedOption={selectedModel}
                onChange={({ detail }) =>
                  update("bedrockModelId", detail.selectedOption.value)
                }
                options={BEDROCK_MODELS}
              />
            </FormField>
          </SpaceBetween>
        </Container>

        <SpaceBetween direction="horizontal" size="s" alignItems="center">
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save Settings
          </Button>

          {saveSuccess && (
            <StatusIndicator type="success">Settings saved</StatusIndicator>
          )}

          {error && (
            <StatusIndicator type="error">{error}</StatusIndicator>
          )}
        </SpaceBetween>
      </SpaceBetween>
    </Box>
  );
}
