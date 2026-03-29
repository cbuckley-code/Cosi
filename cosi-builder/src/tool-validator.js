import Docker from "dockerode";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const HEALTH_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

/**
 * Run a shell command inside a running container and return exit code + output.
 */
async function execInContainer(container, cmd) {
  const exec = await container.exec({
    Cmd: ["sh", "-c", cmd],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({});
  const chunks = [];
  docker.modem.demuxStream(
    stream,
    { write: (d) => chunks.push(d) },
    { write: (d) => chunks.push(d) }
  );
  await new Promise((resolve) => stream.on("end", resolve));
  const inspect = await exec.inspect();
  return { exitCode: inspect.ExitCode, output: Buffer.concat(chunks).toString() };
}

/**
 * Build the Docker image, start a container, run health + MCP checks
 * from inside the container (exec), collect logs, then tear down.
 *
 * @param {string} toolName
 * @param {Record<string, string|object>} files  - generated file contents
 * @returns {{ success: boolean, logs: string[], error?: string }}
 */
export async function validateTool(toolName, files) {
  const uuid = randomUUID().slice(0, 8);
  const imageName = `cosi-validate-${toolName}-${uuid}:latest`;
  const containerName = `cosi-validate-${toolName}-${uuid}`;
  const tmpDir = `/tmp/${containerName}`;

  const logs = [];
  const log = (msg) => {
    logs.push(msg);
    console.log(`[validator] ${msg}`);
  };

  let container = null;

  try {
    // ── 1. Write files to a temp directory ──────────────────────────────────
    await fs.mkdir(tmpDir, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      const text =
        typeof content === "object" ? JSON.stringify(content, null, 2) : content;
      await fs.writeFile(path.join(tmpDir, filename), text, "utf8");
    }
    log(`Files written to ${tmpDir}`);

    // ── 2. Build Docker image ────────────────────────────────────────────────
    log(`Building image ${imageName}…`);
    const fileList = await fs.readdir(tmpDir);
    const buildStream = await docker.buildImage(
      { context: tmpDir, src: fileList },
      { t: imageName }
    );

    const buildLines = await new Promise((resolve, reject) => {
      docker.modem.followProgress(buildStream, (err, output) => {
        if (err) return reject(err);
        const last = output[output.length - 1];
        if (last?.error) return reject(new Error(last.error.trim()));
        resolve(output.map((o) => (o.stream || "").trimEnd()).filter(Boolean));
      });
    });
    buildLines.forEach((l) => logs.push(`  build: ${l}`));
    log("Build succeeded");

    // ── 3. Start the container (no host-port needed — we exec in) ───────────
    container = await docker.createContainer({
      Image: imageName,
      name: containerName,
      HostConfig: { NetworkMode: "none" }, // isolated — no external calls needed
    });
    await container.start();
    log("Container started");

    // ── 4. Poll health endpoint from inside the container ───────────────────
    const healthCmd =
      `node -e "fetch('http://localhost:3000/health')" ` +
      `.then(r=>{if(!r.ok){console.error('HTTP '+r.status);process.exit(1)}})` +
      `.catch(e=>{console.error(e.message);process.exit(1)})"`;

    let healthOk = false;
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const { exitCode, output } = await execInContainer(
        container,
        "node -e \"fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""
      );
      if (exitCode === 0) {
        healthOk = true;
        log("Health check passed");
        break;
      }
      if (output.trim()) log(`  health: ${output.trim()}`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!healthOk) {
      throw new Error(`Health check did not pass within ${HEALTH_TIMEOUT_MS / 1000}s`);
    }

    // ── 5. Test MCP initialize from inside the container ────────────────────
    const mcpCmd =
      `node -e "` +
      `const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',` +
      `params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'v',version:'1'}}});` +
      `fetch('http://localhost:3000/mcp',{method:'POST',` +
      `headers:{'Content-Type':'application/json','Accept':'application/json,text/event-stream'},` +
      `body}).then(r=>{console.log('MCP',r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})" `;

    const { exitCode: mcpCode, output: mcpOut } = await execInContainer(container, mcpCmd);
    const mcpOk = mcpCode === 0;
    log(mcpOk ? `MCP check passed (${mcpOut.trim()})` : `MCP check failed: ${mcpOut.trim()}`);

    // ── 6. Collect runtime logs ──────────────────────────────────────────────
    const rawLogs = await container.logs({ stdout: true, stderr: true, tail: 100 });
    const runtimeLogs = rawLogs.toString().split("\n").filter(Boolean);
    runtimeLogs.forEach((l) => logs.push(`  runtime: ${l}`));

    if (!mcpOk) {
      throw new Error("MCP initialize request failed — see runtime logs above");
    }

    return { success: true, logs };
  } catch (err) {
    log(`Validation failed: ${err.message}`);

    // Collect container logs on failure if we have a container
    if (container) {
      try {
        const rawLogs = await container.logs({ stdout: true, stderr: true, tail: 100 });
        rawLogs
          .toString()
          .split("\n")
          .filter(Boolean)
          .forEach((l) => logs.push(`  runtime: ${l}`));
      } catch {
        // ignore log collection errors
      }
    }

    return { success: false, logs, error: err.message };
  } finally {
    // ── Cleanup ───────────────────────────────────────────────────────────────
    if (container) {
      try {
        await container.stop({ t: 3 });
      } catch {}
      try {
        await container.remove();
      } catch {}
    }
    try {
      await docker.getImage(imageName).remove({ force: true });
    } catch {}
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
