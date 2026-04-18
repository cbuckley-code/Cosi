import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Settings from "../../components/Settings.jsx";
import { useSettings } from "../../hooks/useSettings.js";

vi.mock("../../hooks/useSettings.js", () => ({
  useSettings: vi.fn(),
}));

const DEFAULT_SETTINGS = {
  storageMode: "filesystem",
  gitRepoUrl: "",
  gitBranch: "main",
  awsRegion: "us-west-2",
  awsGovCloud: false,
  bedrockModelId: "us.anthropic.claude-sonnet-4-6",
};

function makeHookResult(overrides = {}) {
  return {
    settings: DEFAULT_SETTINGS,
    loading: false,
    saving: false,
    error: null,
    saveSuccess: false,
    saveSettings: vi.fn(),
    reloadSettings: vi.fn(),
    ...overrides,
  };
}

describe("Settings", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading indicator when loading=true", () => {
    useSettings.mockReturnValue(makeHookResult({ loading: true }));

    render(<Settings />);

    expect(screen.getByText(/loading settings/i)).toBeInTheDocument();
  });

  it("does not show loading indicator when loading=false", () => {
    useSettings.mockReturnValue(makeHookResult({ loading: false }));

    render(<Settings />);

    expect(screen.queryByText(/loading settings/i)).not.toBeInTheDocument();
  });

  it("renders the Storage section with a Storage mode select", () => {
    useSettings.mockReturnValue(makeHookResult());

    render(<Settings />);

    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText(/storage mode/i)).toBeInTheDocument();
  });

  it("shows 'Filesystem' selected when storageMode is filesystem", () => {
    useSettings.mockReturnValue(
      makeHookResult({ settings: { ...DEFAULT_SETTINGS, storageMode: "filesystem" } })
    );

    render(<Settings />);

    expect(screen.getByText("Filesystem")).toBeInTheDocument();
  });

  it("shows 'Git' selected when storageMode is git", () => {
    useSettings.mockReturnValue(
      makeHookResult({ settings: { ...DEFAULT_SETTINGS, storageMode: "git" } })
    );

    render(<Settings />);

    expect(screen.getByText("Git")).toBeInTheDocument();
  });

  it("hides Git Repository URL and Git Branch fields when storageMode is filesystem", () => {
    useSettings.mockReturnValue(
      makeHookResult({ settings: { ...DEFAULT_SETTINGS, storageMode: "filesystem" } })
    );

    render(<Settings />);

    expect(screen.queryByText(/git repository url/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/git branch/i)).not.toBeInTheDocument();
  });

  it("shows Git Repository URL and Git Branch fields when storageMode is git", () => {
    useSettings.mockReturnValue(
      makeHookResult({ settings: { ...DEFAULT_SETTINGS, storageMode: "git" } })
    );

    render(<Settings />);

    expect(screen.getByText(/git repository url/i)).toBeInTheDocument();
    expect(screen.getByText(/git branch/i)).toBeInTheDocument();
  });

  it("renders the Bedrock Configuration section", () => {
    useSettings.mockReturnValue(makeHookResult());

    render(<Settings />);

    expect(screen.getByText("Bedrock Configuration")).toBeInTheDocument();
  });

  it("renders AWS Region select in Bedrock Configuration", () => {
    useSettings.mockReturnValue(makeHookResult());

    render(<Settings />);

    expect(screen.getByText(/aws region/i)).toBeInTheDocument();
  });

  it("renders Bedrock Model select in Bedrock Configuration", () => {
    useSettings.mockReturnValue(makeHookResult());

    render(<Settings />);

    expect(screen.getByText(/bedrock model/i)).toBeInTheDocument();
  });

  it("renders the Save Settings button", () => {
    useSettings.mockReturnValue(makeHookResult());

    render(<Settings />);

    expect(screen.getByRole("button", { name: /save settings/i })).toBeInTheDocument();
  });

  it("calls saveSettings when Save Settings button is clicked", async () => {
    const saveSettings = vi.fn();
    useSettings.mockReturnValue(makeHookResult({ saveSettings }));

    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    expect(saveSettings).toHaveBeenCalledWith(DEFAULT_SETTINGS);
  });

  it("shows success indicator when saveSuccess=true", () => {
    useSettings.mockReturnValue(makeHookResult({ saveSuccess: true }));

    render(<Settings />);

    expect(screen.getByText(/settings saved/i)).toBeInTheDocument();
  });

  it("does not show success indicator when saveSuccess=false", () => {
    useSettings.mockReturnValue(makeHookResult({ saveSuccess: false }));

    render(<Settings />);

    expect(screen.queryByText(/settings saved/i)).not.toBeInTheDocument();
  });

  it("shows error indicator when error is set", () => {
    useSettings.mockReturnValue(makeHookResult({ error: "HTTP 500" }));

    render(<Settings />);

    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
  });

  it("does not show error indicator when error is null", () => {
    useSettings.mockReturnValue(makeHookResult({ error: null }));

    render(<Settings />);

    expect(screen.queryByText("HTTP 500")).not.toBeInTheDocument();
  });

  it("renders AWS GovCloud toggle", () => {
    useSettings.mockReturnValue(makeHookResult());

    render(<Settings />);

    // "AWS GovCloud" appears in the FormField label; use getAllByText since
    // Cloudscape also renders it in an aria-description or helper text
    const govCloudEls = screen.getAllByText(/aws govcloud/i);
    expect(govCloudEls.length).toBeGreaterThanOrEqual(1);
  });
});
