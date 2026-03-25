import Docker from "dockerode";
import path from "path";
import fs from "fs";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

/**
 * Build a Docker image for a tool.
 */
export async function buildTool(toolName, workspace) {
  const toolPath = path.join(workspace, "tools", toolName);

  if (!fs.existsSync(toolPath)) {
    console.warn(`[docker-builder] Tool directory not found: ${toolPath}`);
    return;
  }

  const imageName = `cosi-tool-${toolName}:latest`;
  console.log(`[docker-builder] Building ${imageName} from ${toolPath}`);

  try {
    // Get all files in the tool directory to include in build context
    const files = getFilesRecursively(toolPath, toolPath);

    const stream = await docker.buildImage(
      {
        context: toolPath,
        src: files,
      },
      { t: imageName }
    );

    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, output) => {
        if (err) {
          reject(err);
        } else {
          const lastLine = output[output.length - 1];
          if (lastLine && lastLine.error) {
            reject(new Error(lastLine.error));
          } else {
            console.log(`[docker-builder] Successfully built ${imageName}`);
            resolve();
          }
        }
      });
    });
  } catch (err) {
    console.error(`[docker-builder] Build failed for ${toolName}:`, err.message);
    throw err;
  }
}

/**
 * Start or restart a tool container using docker compose.
 */
export async function startTool(toolName, workspace) {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const exec = promisify(execFile);

  const serviceName = `tool-${toolName}`;

  try {
    await exec("docker", [
      "compose",
      "-f",
      path.join(workspace, "docker-compose.yml"),
      "-f",
      path.join(workspace, "docker-compose.tools.yml"),
      "up",
      "-d",
      "--no-deps",
      serviceName,
    ]);
    console.log(`[docker-builder] Started service ${serviceName}`);
  } catch (err) {
    console.error(`[docker-builder] Failed to start ${serviceName}:`, err.message);
  }
}

/**
 * Get all files recursively in a directory, relative to base.
 */
function getFilesRecursively(dir, base) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath, base));
    } else {
      files.push(relativePath);
    }
  }

  return files;
}
