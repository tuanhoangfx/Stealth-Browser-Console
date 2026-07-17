"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  isAgentSmokeRequest,
  parseAgentSmokeFlag,
  runWithAgentSmokeRequest,
} = require("./agent-smoke-context.cjs");
const { isAgentSmokeLaunch } = require("./agent-smoke-mode.cjs");

describe("agent-smoke-context", () => {
  it("parses request header and body flags", () => {
    assert.equal(parseAgentSmokeFlag({ headers: { "x-stealth-agent-smoke": "1" } }, {}), true);
    assert.equal(parseAgentSmokeFlag({ headers: {} }, { agent_smoke: true }), true);
    assert.equal(parseAgentSmokeFlag({ headers: {} }, {}), false);
  });

  it("scopes agent smoke to async request context", () => {
    assert.equal(isAgentSmokeRequest(), false);
    runWithAgentSmokeRequest(true, () => {
      assert.equal(isAgentSmokeRequest(), true);
      assert.equal(isAgentSmokeLaunch(), true);
    });
    assert.equal(isAgentSmokeRequest(), false);
  });
});
