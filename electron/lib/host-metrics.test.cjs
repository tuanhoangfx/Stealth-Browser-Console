const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { sampleHostMetrics, resetHostMetricsSample } = require("./host-metrics.cjs");

test("sampleHostMetrics returns RAM totals and a pending first CPU sample", () => {
  resetHostMetricsSample();
  const first = sampleHostMetrics();
  assert.equal(first.ok, true);
  assert.equal(first.cpuReady, false);
  assert.equal(first.cpuPercent, 0);
  assert.ok(first.ramTotalBytes > 0);
  assert.ok(first.ramUsedBytes >= 0);
  assert.ok(first.ramUsedBytes <= first.ramTotalBytes);
  assert.ok(first.ramPercent >= 0 && first.ramPercent <= 100);
});

test("second sampleHostMetrics marks CPU ready after a short interval", () => {
  resetHostMetricsSample();
  sampleHostMetrics();
  const start = Date.now();
  while (Date.now() - start < 40) Math.sqrt(Math.random());
  const second = sampleHostMetrics();
  assert.equal(second.cpuReady, true);
  assert.ok(second.cpuPercent >= 0 && second.cpuPercent <= 100);
});

test("packaged loader does not require a path that climbs out of app.asar", () => {
  const src = fs.readFileSync(path.join(__dirname, "host-metrics.cjs"), "utf8");
  assert.equal(src.includes('require("../../../../packages/'), false);
  assert.equal(fs.existsSync(path.join(__dirname, "host-metrics.impl.cjs")), true);
});
