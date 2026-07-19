/**
 * Unit: Microsoft soft-skip must not fire on Google gmail-login steps.
 * Regression: WF00011 "Click Next (email)" was skipped on accounts.google.com.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isMicrosoftLoginUrl,
  isMicrosoftEmailNextClick,
  isMicrosoftPasswordGateStep,
} = require("./script-steps.cjs");

test("isMicrosoftLoginUrl detects Microsoft only", () => {
  assert.equal(isMicrosoftLoginUrl("https://login.live.com/oauth20_authorize.srf"), true);
  assert.equal(isMicrosoftLoginUrl("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"), true);
  assert.equal(isMicrosoftLoginUrl("https://accounts.google.com/v3/signin/identifier"), false);
  assert.equal(isMicrosoftLoginUrl("about:blank"), false);
});

test("isMicrosoftEmailNextClick ignores Google Click Next (email)", () => {
  const step = {
    name: "Click Next (email)",
    selector: '#identifierNext button, #identifierNext, button:has-text("Next")',
  };
  assert.equal(isMicrosoftEmailNextClick(step, "https://accounts.google.com/v3/signin/identifier"), false);
  assert.equal(isMicrosoftEmailNextClick(step, "https://login.live.com/login.srf"), true);
});

test("isMicrosoftPasswordGateStep ignores Google Passwd wait", () => {
  const googleStep = { name: "Wait for password input", selector: 'input[name="Passwd"], input[type="password"]' };
  assert.equal(isMicrosoftPasswordGateStep(googleStep, "https://accounts.google.com/v3/signin/challenge/pwd"), false);
  const msStep = { name: "Wait for password input", selector: "#i0118, input[name=passwd]" };
  assert.equal(isMicrosoftPasswordGateStep(msStep, "https://login.live.com/login.srf"), true);
});
