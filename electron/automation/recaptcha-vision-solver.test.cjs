"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  extractVisionResponseText,
  parseVisionTileNumbers,
  findRecaptchaFramesInTree,
  solveGoogleRecaptchaViaCdp,
  solveGoogleRecaptchaOnPlaywrightPage,
  matchMaskedRecoveryEmail,
  handleGoogleRecoveryEmailChallengeViaCdp,
  handleGoogleQrChallengeViaCdp,
  findUniversalCaptchaFramesInTree,
  askVisionForArkoseOrTextCaptcha,
  solveArkoseOrFacebookCaptchaViaCdp,
} = require("./recaptcha-vision-solver.cjs");

describe("recaptcha-vision-solver SSOT (ok 1, ok 2, ok 3)", () => {
  it("extracts text from both 9router SSE stream and standard JSON", () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"{\\"tiles\\":"}}]}',
      'data: {"choices":[{"delta":{"content":"[1, 5, 9]}"}}]}',
      "data: [DONE]",
    ].join("\n");
    assert.equal(extractVisionResponseText(sse), '{"tiles":[1, 5, 9]}');

    const json = JSON.stringify({
      choices: [{ message: { content: '{"tiles":[2,4]}' } }],
    });
    assert.equal(extractVisionResponseText(json), '{"tiles":[2,4]}');
  });

  it("parses 3x3 and 4x4 tile numbers accurately", () => {
    assert.deepEqual(parseVisionTileNumbers('{"tiles":[1, 4, 9, 12]}', 3), [1, 4, 9]);
    assert.deepEqual(parseVisionTileNumbers('{"tiles":[1, 4, 9, 12, 16]}', 4), [1, 4, 9, 12, 16]);
    assert.deepEqual(parseVisionTileNumbers('{"tiles":[]}', 3), []);
  });

  it("locates anchor and bframe inside Page.getFrameTree hierarchy", () => {
    const tree = {
      frame: { id: "root", url: "https://accounts.google.com/v3/signin/challenge/recaptcha" },
      childFrames: [
        {
          frame: { id: "anchor-1", url: "https://www.google.com/recaptcha/api2/anchor?ar=1" },
        },
        {
          frame: { id: "bframe-1", url: "https://www.google.com/recaptcha/api2/bframe?hl=en" },
        },
      ],
    };
    const found = findRecaptchaFramesInTree(tree);
    assert.equal(found.anchorFrame?.id, "anchor-1");
    assert.equal(found.bframe?.id, "bframe-1");
  });

  it("solves a 3x3 reCAPTCHA challenge via CDP isolated worlds and clicks Next", async () => {
    let checked = false;
    let nextClicked = false;
    const cdpSend = async (method, params = {}) => {
      if (method === "Page.getFrameTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://accounts.google.com/v3/signin/challenge/recaptcha" },
            childFrames: [
              { frame: { id: "f-anchor", url: "https://www.google.com/recaptcha/enterprise/anchor" } },
              { frame: { id: "f-bframe", url: "https://www.google.com/recaptcha/enterprise/bframe" } },
            ],
          },
        };
      }
      if (method === "Page.createIsolatedWorld") {
        return { executionContextId: `ctx-${params.frameId}` };
      }
      if (method === "Page.captureScreenshot") {
        return { data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" };
      }
      if (method === "Runtime.evaluate") {
        const expr = String(params.expression || "");
        if (params.contextId === "ctx-f-anchor") {
          return { result: { value: expr.includes("return { checked:") ? { checked } : checked } };
        }
        if (params.contextId === "ctx-f-bframe") {
          if (expr.includes("promptText")) {
            return {
              result: {
                value: {
                  promptText: "Select all images with bicycles",
                  target: "bicycles",
                  tileCount: 9,
                  gridSize: 3,
                  isDynamic: false,
                  verifyLabel: "Verify",
                  hasError: false,
                },
              },
            };
          }
          if (expr.includes("#recaptcha-verify-button")) {
            checked = true;
            return { result: { value: true } };
          }
          return { result: { value: false } };
        }
        if (expr.includes("hasAnchor")) {
          return {
            result: {
              value: {
                url: "https://accounts.google.com/v3/signin/challenge/recaptcha",
                hasAnchor: true,
                anchorRect: { x: 40, y: 200, width: 300, height: 74 },
                hasBframe: !checked,
                bframeRect: { x: 50, y: 80, width: 400, height: 580 },
              },
            },
          };
        }
        if (expr.includes("#identifierNext")) {
          nextClicked = true;
          return { result: { value: true } };
        }
      }
      return {};
    };

    const mockFetch = async () => ({
      ok: true,
      text: async () => 'data: {"choices":[{"delta":{"content":"{\\"tiles\\":[1,5]}"}}]}\ndata: [DONE]\n',
    });

    const out = await solveGoogleRecaptchaViaCdp(cdpSend, {
      maxRounds: 3,
      fetchFn: mockFetch,
    });
    assert.equal(out.ok, true);
    assert.equal(out.solved, true);
    assert.equal(nextClicked, true);
  });

  it("gracefully handles Playwright pages without CDP support", async () => {
    const fakePage = { context: () => ({}) };
    const res = await solveGoogleRecaptchaOnPlaywrightPage(fakePage);
    assert.equal(res.ok, false);
    assert.equal(res.solved, false);
    assert.equal(res.reason, "cdp_session_unsupported");
  });

  it("matches masked recovery email hints against candidate list (ok 1)", () => {
    const m1 = matchMaskedRecoveryEmail("Get a verification code at ran•••••@gmail.com", [
      "oneday0159@outlook.com",
      "randal6995chim@gmail.com",
      "randomzoe@hotmail.com",
    ]);
    assert.equal(m1.prefix, "ran");
    assert.equal(m1.domain, "gmail.com");
    assert.equal(m1.matched, "randal6995chim@gmail.com");

    const m2 = matchMaskedRecoveryEmail("Get a verification code at zzz•••••@gmail.com", [
      "oneday0159@outlook.com",
    ]);
    assert.equal(m2.prefix, "zzz");
    assert.equal(m2.matched, "");
  });

  it("completes recovery email confirmation challenge when email matches (ok 1)", async () => {
    let step = 0;
    const cdpSend = async (method, params = {}) => {
      if (method !== "Runtime.evaluate") return {};
      const expr = String(params.expression || "");
      if (expr.includes("const items = Array.from") && step === 0) {
        step = 1;
        return {
          result: {
            value: {
              url: "https://accounts.google.com/v3/signin/challenge/selection",
              bodyText: "Confirm your recovery email one•••••@outlook.com",
              items: [{ type: "12", text: "Confirm your recovery email" }],
            },
          },
        };
      }
      if (expr.includes("confirm_email")) {
        return { result: { value: "confirm_email" } };
      }
      if (expr.includes("hasEmailInput")) {
        return {
          result: {
            value: {
              url: "https://accounts.google.com/v3/signin/challenge/kpe",
              bodyText: "Confirm your recovery email one•••••@outlook.com",
              hasEmailInput: true,
              hasCodeInput: false,
            },
          },
        };
      }
      if (expr.includes("emailVal")) {
        return { result: { value: true } };
      }
      return {
        result: {
          value: {
            url: "https://one.google.com/storage",
            bodyText: "15 GB of 15 GB used",
            hasCodeInput: false,
          },
        },
      };
    };

    const res = await handleGoogleRecoveryEmailChallengeViaCdp(cdpSend, {
      mailRecover: "oneday0159@outlook.com",
    });
    assert.equal(res.ok, true);
    assert.equal(res.solved, true);
    assert.equal(res.emailUsed, "oneday0159@outlook.com");
  });

  it("decodes QR challenge URL and reports Android Stealth Bridge status (ok 3)", async () => {
    const cdpSend = async (method) => {
      if (method === "Runtime.evaluate") {
        return {
          result: {
            value: {
              ok: true,
              qrUrl: "https://accounts.google.com/v3/signin/confirmqrcode?token=test123",
              hasQrImage: true,
              qrImageBase64Length: 1024,
            },
          },
        };
      }
      return {};
    };
    const res = await handleGoogleQrChallengeViaCdp(cdpSend, { code: "0208" });
    assert.equal(res.ok, true);
    assert.match(res.qrUrl, /confirmqrcode/);
    assert.equal(typeof res.bridgeStatus?.adbConnected, "boolean");
  });

  it("locates Arkose FunCaptcha and Facebook checkpoint frames in Page.getFrameTree (ok 3)", () => {
    const tree = {
      frame: { id: "root", url: "https://login.live.com/login.srf" },
      childFrames: [
        {
          frame: {
            id: "ark-enforce",
            name: "enforcementFrame",
            url: "https://iframe.arkoselabs.com/B7D8911C/index.html",
          },
          childFrames: [
            {
              frame: {
                id: "ark-game",
                name: "game-core-frame",
                url: "https://client-api.arkoselabs.com/fc/gc/?token=abc",
              },
            },
          ],
        },
        {
          frame: {
            id: "fb-cap",
            url: "https://www.fbsbx.com/captcha/recaptcha/iframe/?compact=0",
          },
        },
      ],
    };
    const found = findUniversalCaptchaFramesInTree(tree);
    assert.equal(found.arkoseEnforcementFrame?.id, "ark-enforce");
    assert.equal(found.arkoseGameFrame?.id, "ark-game");
    assert.equal(found.facebookCaptchaFrame?.id, "fb-cap");
  });

  it("solves Arkose 6-tile and Facebook/HIP text captcha via Vision (ok 3)", async () => {
    const mockTileFetch = async () => ({
      ok: true,
      text: async () => '{"choices":[{"message":{"content":"{\\"mode\\":\\"tile\\",\\"tile\\":4}"}}]}',
    });
    const tileRes = await askVisionForArkoseOrTextCaptcha(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "arkose_tile",
      "Pick the penguins",
      { fetchFn: mockTileFetch },
    );
    assert.equal(tileRes.ok, true);
    assert.equal(tileRes.tile, 4);

    let submittedText = "";
    const cdpSendText = async (method, params = {}) => {
      if (method === "Page.getFrameTree") {
        return { frameTree: { frame: { id: "main", url: "https://www.facebook.com/checkpoint/" } } };
      }
      if (method === "Page.captureScreenshot") {
        return { data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" };
      }
      if (method === "Runtime.evaluate") {
        const expr = String(params.expression || "");
        if (expr.includes("hasInput")) {
          return {
            result: {
              value: { hasInput: true, imgRect: { x: 20, y: 40, width: 200, height: 70 } },
            },
          };
        }
        if (expr.includes("input.value =")) {
          const m = expr.match(/input\.value = "([^"]+)"/);
          submittedText = m ? m[1] : "";
          return { result: { value: true } };
        }
      }
      return {};
    };
    const mockTextFetch = async () => ({
      ok: true,
      text: async () => 'data: {"choices":[{"delta":{"content":"{\\"mode\\":\\"text\\",\\"text\\":\\"K9X4M\\"}"}}]}\ndata: [DONE]\n',
    });
    const textSolve = await solveArkoseOrFacebookCaptchaViaCdp(cdpSendText, {
      fetchFn: mockTextFetch,
    });
    assert.equal(textSolve.ok, true);
    assert.equal(textSolve.solved, true);
    assert.equal(textSolve.reason, "text_captcha_submitted");
    assert.equal(submittedText, "K9X4M");
  });
});
