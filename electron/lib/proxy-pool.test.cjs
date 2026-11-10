"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { parseProxy, probeTcpPort } = require("./proxy-pool.cjs");

test("probeTcpPort returns tcpAlive=true and positive RTT on listening local TCP port", async () => {
  const server = net.createServer((socket) => {
    socket.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    const res = await probeTcpPort("127.0.0.1", address.port, { timeoutMs: 1500 });
    assert.equal(res.tcpAlive, true);
    assert.equal(typeof res.tcpLatencyMs, "number");
    assert.ok(res.tcpLatencyMs >= 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("probeTcpPort returns tcpAlive=false on closed port and invalid host/port", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const closedPort = server.address().port;
  await new Promise((resolve) => server.close(resolve));

  const closedRes = await probeTcpPort("127.0.0.1", closedPort, { timeoutMs: 800 });
  assert.equal(closedRes.tcpAlive, false);
  assert.equal(closedRes.tcpLatencyMs, null);

  const invalidRes = await probeTcpPort("", 70000);
  assert.equal(invalidRes.tcpAlive, false);
  assert.equal(invalidRes.reason, "invalid-host-port");
});

test("parseProxy handles antidetect host:port:user:pass and scheme URLs", () => {
  const p = parseProxy("171.236.183.124:33927:czp1:secret");
  assert.deepEqual(p, {
    protocol: "http",
    host: "171.236.183.124",
    port: 33927,
    username: "czp1",
    password: "secret",
  });
});
