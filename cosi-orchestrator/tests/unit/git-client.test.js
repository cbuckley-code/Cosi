import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mockGit must be defined before vi.mock so the factory can close over it.
// In Vitest, vi.mock is hoisted, so we use a module-level variable and
// assign the mock implementation before imports resolve.
const mockGit = {
  addConfig: vi.fn(),
  add: vi.fn(),
  status: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
};

vi.mock("simple-git", () => ({
  default: vi.fn(() => mockGit),
}));

// Dynamic import after mocks are set up
const { isGitMode, commitAndPush, getStatus } = await import(
  "../../src/git-client.js"
);

describe("isGitMode", () => {
  const originalMode = process.env.STORAGE_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.STORAGE_MODE;
    } else {
      process.env.STORAGE_MODE = originalMode;
    }
  });

  it("returns true when STORAGE_MODE=git", () => {
    process.env.STORAGE_MODE = "git";
    expect(isGitMode()).toBe(true);
  });

  it("returns false when STORAGE_MODE=filesystem", () => {
    process.env.STORAGE_MODE = "filesystem";
    expect(isGitMode()).toBe(false);
  });

  it("returns false when STORAGE_MODE is unset (defaults to filesystem)", () => {
    delete process.env.STORAGE_MODE;
    expect(isGitMode()).toBe(false);
  });
});

describe("commitAndPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.STORAGE_MODE;
    delete process.env.GIT_BRANCH;
  });

  it("is a no-op in filesystem mode", async () => {
    process.env.STORAGE_MODE = "filesystem";
    await commitAndPush("my-tool", "feat: add tool");
    expect(mockGit.add).not.toHaveBeenCalled();
    expect(mockGit.commit).not.toHaveBeenCalled();
    expect(mockGit.push).not.toHaveBeenCalled();
  });

  it("calls add, status, commit, and push in git mode when there are staged files", async () => {
    process.env.STORAGE_MODE = "git";
    mockGit.addConfig.mockResolvedValue(undefined);
    mockGit.add.mockResolvedValue(undefined);
    mockGit.status.mockResolvedValue({ staged: ["tools/my-tool/index.js"] });
    mockGit.commit.mockResolvedValue(undefined);
    mockGit.push.mockResolvedValue(undefined);

    await commitAndPush("my-tool", "feat: add my-tool");

    expect(mockGit.add).toHaveBeenCalledWith("tools/my-tool/.");
    expect(mockGit.status).toHaveBeenCalled();
    expect(mockGit.commit).toHaveBeenCalledWith("feat: add my-tool");
    expect(mockGit.push).toHaveBeenCalledWith("origin", "main");
  });

  it("skips commit when status.staged is empty", async () => {
    process.env.STORAGE_MODE = "git";
    mockGit.addConfig.mockResolvedValue(undefined);
    mockGit.add.mockResolvedValue(undefined);
    mockGit.status.mockResolvedValue({ staged: [] });

    await commitAndPush("my-tool", "feat: add my-tool");

    expect(mockGit.add).toHaveBeenCalled();
    expect(mockGit.commit).not.toHaveBeenCalled();
    expect(mockGit.push).not.toHaveBeenCalled();
  });

  it("uses GIT_BRANCH env var when set", async () => {
    process.env.STORAGE_MODE = "git";
    process.env.GIT_BRANCH = "develop";
    mockGit.addConfig.mockResolvedValue(undefined);
    mockGit.add.mockResolvedValue(undefined);
    mockGit.status.mockResolvedValue({ staged: ["file.js"] });
    mockGit.commit.mockResolvedValue(undefined);
    mockGit.push.mockResolvedValue(undefined);

    await commitAndPush("my-tool", "feat: add my-tool");

    expect(mockGit.push).toHaveBeenCalledWith("origin", "develop");
  });

  it("uses default commit message when none provided", async () => {
    process.env.STORAGE_MODE = "git";
    mockGit.addConfig.mockResolvedValue(undefined);
    mockGit.add.mockResolvedValue(undefined);
    mockGit.status.mockResolvedValue({ staged: ["file.js"] });
    mockGit.commit.mockResolvedValue(undefined);
    mockGit.push.mockResolvedValue(undefined);

    await commitAndPush("my-tool");

    expect(mockGit.commit).toHaveBeenCalledWith("feat: add tool my-tool");
  });

  it("throws when git.commit rejects", async () => {
    process.env.STORAGE_MODE = "git";
    mockGit.addConfig.mockResolvedValue(undefined);
    mockGit.add.mockResolvedValue(undefined);
    mockGit.status.mockResolvedValue({ staged: ["file.js"] });
    mockGit.commit.mockRejectedValue(new Error("commit failed"));

    await expect(commitAndPush("my-tool", "feat: add my-tool")).rejects.toThrow(
      "commit failed"
    );
  });

  it("throws when git.push rejects", async () => {
    process.env.STORAGE_MODE = "git";
    mockGit.addConfig.mockResolvedValue(undefined);
    mockGit.add.mockResolvedValue(undefined);
    mockGit.status.mockResolvedValue({ staged: ["file.js"] });
    mockGit.commit.mockResolvedValue(undefined);
    mockGit.push.mockRejectedValue(new Error("push failed"));

    await expect(commitAndPush("my-tool", "feat: add my-tool")).rejects.toThrow(
      "push failed"
    );
  });
});

describe("getStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the status object from git.status()", async () => {
    const fakeStatus = { staged: [], modified: ["foo.js"] };
    mockGit.status.mockResolvedValue(fakeStatus);

    const result = await getStatus();
    expect(result).toEqual(fakeStatus);
  });

  it("returns null when git.status() throws", async () => {
    mockGit.status.mockRejectedValue(new Error("git error"));

    const result = await getStatus();
    expect(result).toBeNull();
  });
});
