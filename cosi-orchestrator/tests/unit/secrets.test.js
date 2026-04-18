import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { mkdtemp, writeFile, rm } from "fs/promises";
import path from "path";

// We need to re-import the module after setting SECRETS_FILE, but since the
// module reads SECRETS_FILE at call time (inside read()), we can just set the
// env var before each test and import the functions once. The module reads the
// env variable on each read() call via the SECRETS_FILE constant captured at
// module load time — actually it captures it at load time, so we need to
// control the path via a known temp file we set before importing.
//
// Looking at the source: `const SECRETS_FILE = process.env.SECRETS_FILE || "/app/secrets.env";`
// This is a module-level constant, so it's set once at import time.
// We need to set process.env.SECRETS_FILE BEFORE the first import of secrets.js.

let tmpDir;
let secretsFilePath;

// Set SECRETS_FILE before importing so the module captures it.
// We use a dynamic import inside each describe to control the path,
// but since modules are cached we instead set up SECRETS_FILE before
// importing, and change the file contents per-test.

// We'll set a known path at process start and change file contents per test.
const FIXED_TMP = path.join(tmpdir(), "cosi-secrets-test-" + process.pid + ".env");
process.env.SECRETS_FILE = FIXED_TMP;

const { getSecret, setSecret, deleteSecret, listSecretNames, getToolSecrets } =
  await import("../../src/secrets.js");

async function writeSecrets(content) {
  await writeFile(FIXED_TMP, content, "utf8");
}

async function deleteSecretsFile() {
  try {
    await rm(FIXED_TMP);
  } catch {
    // ignore if already gone
  }
}

describe("getSecret", () => {
  afterEach(deleteSecretsFile);

  it("returns value for existing key", async () => {
    await writeSecrets("FOO=bar\nBAZ=qux\n");
    expect(await getSecret("FOO")).toBe("bar");
  });

  it("returns null for missing key", async () => {
    await writeSecrets("FOO=bar\n");
    expect(await getSecret("MISSING")).toBeNull();
  });

  it("returns null when file does not exist", async () => {
    await deleteSecretsFile();
    expect(await getSecret("FOO")).toBeNull();
  });

  it("ignores comment lines starting with #", async () => {
    await writeSecrets("# this is a comment\nFOO=bar\n");
    expect(await getSecret("FOO")).toBe("bar");
  });

  it("ignores blank lines", async () => {
    await writeSecrets("\n\nFOO=bar\n\n");
    expect(await getSecret("FOO")).toBe("bar");
  });

  it("handles values containing = signs", async () => {
    await writeSecrets("TOKEN=abc=def=ghi\n");
    expect(await getSecret("TOKEN")).toBe("abc=def=ghi");
  });
});

describe("setSecret", () => {
  afterEach(deleteSecretsFile);

  it("creates file if missing and adds new key", async () => {
    await deleteSecretsFile();
    await setSecret("NEW_KEY", "newvalue");
    expect(await getSecret("NEW_KEY")).toBe("newvalue");
  });

  it("adds a new key without removing existing keys", async () => {
    await writeSecrets("EXISTING=hello\n");
    await setSecret("ANOTHER", "world");
    expect(await getSecret("EXISTING")).toBe("hello");
    expect(await getSecret("ANOTHER")).toBe("world");
  });

  it("updates an existing key", async () => {
    await writeSecrets("FOO=old\n");
    await setSecret("FOO", "new");
    expect(await getSecret("FOO")).toBe("new");
  });

  it("preserves other keys when updating", async () => {
    await writeSecrets("FOO=old\nBAR=keep\n");
    await setSecret("FOO", "updated");
    expect(await getSecret("BAR")).toBe("keep");
    expect(await getSecret("FOO")).toBe("updated");
  });
});

describe("deleteSecret", () => {
  afterEach(deleteSecretsFile);

  it("removes the specified key", async () => {
    await writeSecrets("FOO=bar\nBAZ=qux\n");
    await deleteSecret("FOO");
    expect(await getSecret("FOO")).toBeNull();
  });

  it("preserves other keys when deleting", async () => {
    await writeSecrets("FOO=bar\nBAZ=qux\n");
    await deleteSecret("FOO");
    expect(await getSecret("BAZ")).toBe("qux");
  });

  it("is a no-op when key does not exist", async () => {
    await writeSecrets("FOO=bar\n");
    await deleteSecret("MISSING");
    expect(await getSecret("FOO")).toBe("bar");
  });

  it("works when file does not exist (no error thrown)", async () => {
    await deleteSecretsFile();
    await expect(deleteSecret("FOO")).resolves.not.toThrow();
  });
});

describe("listSecretNames", () => {
  afterEach(deleteSecretsFile);

  it("returns all key names", async () => {
    await writeSecrets("FOO=1\nBAR=2\nBAZ=3\n");
    const names = await listSecretNames();
    expect(names).toEqual(expect.arrayContaining(["FOO", "BAR", "BAZ"]));
    expect(names).toHaveLength(3);
  });

  it("returns [] when file is empty", async () => {
    await writeSecrets("");
    expect(await listSecretNames()).toEqual([]);
  });

  it("returns [] when file does not exist", async () => {
    await deleteSecretsFile();
    expect(await listSecretNames()).toEqual([]);
  });

  it("skips comment and blank lines", async () => {
    await writeSecrets("# comment\n\nFOO=bar\n");
    const names = await listSecretNames();
    expect(names).toEqual(["FOO"]);
  });
});

describe("getToolSecrets", () => {
  afterEach(deleteSecretsFile);

  it("maps secret names to COSI_SECRET_* env keys (uppercased, slashes→underscores)", async () => {
    // The env key for secret name "my-tool/API_KEY" should be:
    // COSI_SECRET_MY_TOOL_API_KEY (slashes and hyphens → underscores, uppercased)
    await writeSecrets("COSI_SECRET_MY_TOOL_API_KEY=secret123\n");
    const result = await getToolSecrets("any-tool", ["my-tool/API_KEY"]);
    expect(result["my-tool/API_KEY"]).toBe("secret123");
  });

  it("returns null for secret names not present in file", async () => {
    await writeSecrets("COSI_SECRET_OTHER=val\n");
    const result = await getToolSecrets("my-tool", ["MISSING_KEY"]);
    expect(result["MISSING_KEY"]).toBeNull();
  });

  it("handles multiple secrets at once", async () => {
    await writeSecrets("COSI_SECRET_KEY_A=alpha\nCOSI_SECRET_KEY_B=beta\n");
    const result = await getToolSecrets("my-tool", ["KEY_A", "KEY_B", "KEY_C"]);
    expect(result["KEY_A"]).toBe("alpha");
    expect(result["KEY_B"]).toBe("beta");
    expect(result["KEY_C"]).toBeNull();
  });

  it("returns {} for empty secretNames array", async () => {
    await writeSecrets("COSI_SECRET_FOO=bar\n");
    const result = await getToolSecrets("my-tool", []);
    expect(result).toEqual({});
  });

  it("uppercases the secret name when building the env key", async () => {
    await writeSecrets("COSI_SECRET_APIKEY=myval\n");
    const result = await getToolSecrets("my-tool", ["apikey"]);
    expect(result["apikey"]).toBe("myval");
  });
});
