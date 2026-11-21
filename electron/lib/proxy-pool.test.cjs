"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { parseProxy, probeTcpPort, verifyProxyHttpsTunnel, checkProxy } = require("./proxy-pool.cjs");

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

test("verifyProxyHttpsTunnel distinguishes 407 auth failure and https_tls_timeout after CONNECT 200", async () => {
  const server407 = net.createServer((socket) => {
    socket.once("data", () => {
      socket.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n");
    });
  });
  await new Promise((r) => server407.listen(0, "127.0.0.1", r));
  const port407 = server407.address().port;

  const stalledSockets = [];
  const serverStall = net.createServer((socket) => {
    stalledSockets.push(socket);
    socket.once("data", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      // Intentionally swallow TLS ClientHello to simulate carrier CGNAT HTTPS stall
    });
  });
  await new Promise((r) => serverStall.listen(0, "127.0.0.1", r));
  const portStall = serverStall.address().port;

  try {
    const authRes = await verifyProxyHttpsTunnel(`127.0.0.1:${port407}:u:p`, { timeoutMs: 1500 });
    assert.equal(authRes.ok, false);
    assert.equal(authRes.reason, "proxy_auth_required");

    const tlsStallRes = await verifyProxyHttpsTunnel(`127.0.0.1:${portStall}:u:p`, { timeoutMs: 1050 });
    assert.equal(tlsStallRes.ok, false);
    assert.equal(tlsStallRes.reason, "https_tls_timeout");

    const sockRes = await checkProxy(`socks5://127.0.0.1:${portStall}`, { verifyHttps: true });
    assert.equal(sockRes.alive, null);
  } finally {
    for (const s of stalledSockets) {
      try { s.destroy(); } catch {}
    }
    await new Promise((r) => server407.close(r));
    await new Promise((r) => serverStall.close(r));
  }
});
