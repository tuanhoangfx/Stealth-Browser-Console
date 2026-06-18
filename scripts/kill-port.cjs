const { execSync } = require("node:child_process");

const ports = process.argv.slice(2).map((p) => Number(p)).filter((p) => p > 0);

if (ports.length === 0) {
  console.error("Usage: node scripts/kill-port.cjs <port> [port2 ...]");
  process.exit(1);
}

for (const port of ports) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr ":${port} "`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes("LISTENING")) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
          console.log(`[kill-port] Freed :${port} (PID ${pid})`);
        } catch {
          /* already gone */
        }
      }
      if (pids.size === 0) console.log(`[kill-port] :${port} is free`);
    } else {
      execSync(`lsof -ti :${port} | xargs -r kill -9`, { stdio: "ignore", shell: true });
      console.log(`[kill-port] Freed :${port}`);
    }
  } catch {
    console.log(`[kill-port] :${port} is free`);
  }
}
