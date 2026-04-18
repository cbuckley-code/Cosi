import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSettings } from "../../hooks/useSettings.js";

const DEFAULT_SETTINGS = {
  storageMode: "filesystem",
  gitRepoUrl: "",
  gitBranch: "main",
  awsRegion: "us-west-2",
  awsGovCloud: false,
  bedrockModelId: "us.anthropic.claude-sonnet-4-6",
};

function makeOkResponse(data) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  };
}

function makeErrorResponse(status) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  };
}

describe("useSettings", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  it("starts with loading=true and DEFAULT_SETTINGS", () => {
    // Never resolve so we can inspect the initial state
    fetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSettings());

    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.saveSuccess).toBe(false);
  });

  it("sets loading=false and populates settings after fetch resolves", async () => {
    const serverSettings = {
      storageMode: "git",
      gitRepoUrl: "https://github.com/org/repo.git",
      gitBranch: "main",
      awsRegion: "us-east-1",
      awsGovCloud: false,
      bedrockModelId: "us.anthropic.claude-sonnet-4-6",
    };

    fetch.mockResolvedValue(makeOkResponse(serverSettings));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings).toEqual({
      ...DEFAULT_SETTINGS,
      ...serverSettings,
    });
    expect(result.current.error).toBe(null);
  });

  it("fills in missing keys from DEFAULT_SETTINGS when server returns partial data", async () => {
    const partial = { storageMode: "git", gitRepoUrl: "https://example.com/repo.git" };

    fetch.mockResolvedValue(makeOkResponse(partial));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings.storageMode).toBe("git");
    expect(result.current.settings.gitRepoUrl).toBe("https://example.com/repo.git");
    // Defaults filled in
    expect(result.current.settings.gitBranch).toBe("main");
    expect(result.current.settings.awsRegion).toBe("us-west-2");
  });

  it("sets error when fetch returns a non-ok response", async () => {
    fetch.mockResolvedValue(makeErrorResponse(500));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("HTTP 500");
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("sets error when fetch throws (network failure)", async () => {
    fetch.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network error");
  });

  it("saveSettings POSTs to /api/settings and sets saveSuccess=true on 200", async () => {
    // First call: initial load
    fetch.mockResolvedValueOnce(makeOkResponse(DEFAULT_SETTINGS));
    // Second call: save
    fetch.mockResolvedValueOnce(makeOkResponse({}));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const newSettings = { ...DEFAULT_SETTINGS, storageMode: "git" };

    await act(async () => {
      await result.current.saveSettings(newSettings);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = fetch.mock.calls[1];
    expect(url).toBe("/api/settings");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual(newSettings);

    expect(result.current.saveSuccess).toBe(true);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.settings).toEqual(newSettings);
  });

  it("saveSettings sets error when server returns non-ok response", async () => {
    fetch.mockResolvedValueOnce(makeOkResponse(DEFAULT_SETTINGS));
    fetch.mockResolvedValueOnce(makeErrorResponse(422));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveSettings(DEFAULT_SETTINGS);
    });

    expect(result.current.error).toBe("HTTP 422");
    expect(result.current.saveSuccess).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it("saveSettings sets error on network failure during save", async () => {
    fetch.mockResolvedValueOnce(makeOkResponse(DEFAULT_SETTINGS));
    fetch.mockRejectedValueOnce(new Error("Connection refused"));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveSettings(DEFAULT_SETTINGS);
    });

    expect(result.current.error).toBe("Connection refused");
    expect(result.current.saveSuccess).toBe(false);
  });

  it("reloadSettings re-fetches from the server", async () => {
    fetch.mockResolvedValue(makeOkResponse(DEFAULT_SETTINGS));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reloadSettings();
    });

    // Initial load + explicit reload
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("/api/settings");
  });
});
