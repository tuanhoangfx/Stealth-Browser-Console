/** Hard timeout + explicit exit for agent smokes (avoids orphan exit 1 when PASS logged). */

/**
 * @param {() => Promise<void>} fn
 * @param {{ label?: string, timeoutMs?: number }} [opts]
 */
export async function runSmokeWithTimeout(fn, { label = "smoke", timeoutMs = 60_000 } = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: TIMEOUT after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    await Promise.race([fn(), timeout]);
    clearTimeout(timer);
    process.exit(0);
  } catch (error) {
    clearTimeout(timer);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
