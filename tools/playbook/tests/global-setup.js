import { execSync } from "child_process";
import net from "net";

const REDIS_HOST = "localhost";
const REDIS_PORT = 6399;
const CONTAINER_NAME = "cosi-test-redis";

function isRedisReachable(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

async function waitForRedis(retries = 20, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    if (await isRedisReachable(REDIS_HOST, REDIS_PORT)) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Redis did not become ready on ${REDIS_HOST}:${REDIS_PORT}`);
}

export async function setup() {
  process.setMaxListeners(0);

  if (process.env.CI) {
    await waitForRedis();
    return;
  }

  if (await isRedisReachable(REDIS_HOST, REDIS_PORT)) return;

  try {
    execSync(
      `docker run -d --name ${CONTAINER_NAME} -p ${REDIS_PORT}:6379 redis:7-alpine`,
      { stdio: "pipe" }
    );
  } catch {
    try {
      execSync(`docker start ${CONTAINER_NAME}`, { stdio: "pipe" });
    } catch {
      // Already running or Docker unavailable — proceed and let tests fail naturally
    }
  }

  await waitForRedis();
}

export async function teardown() {
  if (process.env.CI) return;
  try {
    execSync(`docker stop ${CONTAINER_NAME} && docker rm ${CONTAINER_NAME}`, {
      stdio: "pipe",
    });
  } catch {
    // Ignore cleanup errors
  }
}
