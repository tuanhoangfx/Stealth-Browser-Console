"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { isAgentSmokeLaunch } = require("./agent-smoke-mode.cjs");

describe("agent-smoke-mode", () => {
  const keys = [
    "STEALTH_AGENT_SMOKE",
    "STEALTH_HEADLESS_SMOKE",
    "CURSOR_AGENT",
    "CURSOR_TRACE_ID",
  ];

  function withEnv(patch, fn) {
    const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, patch);
    try {
      fn();
    } finally {
      for (const key of keys) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    }
  }

  it("detects explicit agent smoke env", () => {
    withEnv({ STEALTH_AGENT_SMOKE: "1" }, () => {
      assert.equal(isAgentSmokeLaunch(), true);
    });
  });

  it("detects per-request agent smoke without env", () => {
    const { runWithAgentSmokeRequest } = require("./agent-smoke-context.cjs");
    withEnv({}, () => {
      runWithAgentSmokeRequest(true, () => {
        assert.equal(isAgentSmokeLaunch(), true);
      });
    });
  });

  it("is false for normal interactive dev", () => {
    withEnv({}, () => {
      assert.equal(isAgentSmokeLaunch(), false);
    });
  });

  it("does not treat generic Cursor IDE trace id as agent smoke", () => {
    withEnv({ CURSOR_TRACE_ID: "trace-123" }, () => {
      assert.equal(isAgentSmokeLaunch(), false);
    });
  });

  it("does not treat CURSOR_AGENT env alone as agent smoke", () => {
    withEnv({ CURSOR_AGENT: "1" }, () => {
      assert.equal(isAgentSmokeLaunch(), false);
    });
  });
});
