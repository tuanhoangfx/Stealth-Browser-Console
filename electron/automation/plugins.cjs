"use strict";
/**
 * Domain plugins cho BrowserHub API.
 */

function freshRequire(relPath) {
  const abs = require.resolve(relPath);
  delete require.cache[abs];
  return require(relPath);
}

const facebookCreatePages = {
  id: "fb.create-pages",
  method: "POST",
  pattern: /^\/api\/fb\/create-pages$/,
  sse: true,
  async handler(ctx) {
    const { body, services, send, res } = ctx;
    const { profile_id, names } = body;
    if (!profile_id || !Array.isArray(names) || names.length === 0) {
      return send.json(res, 400, { ok: false, error: "profile_id và names[] là bắt buộc" });
    }
    const context = services.sessionManager.getContext(profile_id);
    if (!context) {
      return send.json(res, 400, {
        ok: false,
        error: "Profile chưa được launch — hãy bấm Launch trong P0025 hoặc P0003 trước",
      });
    }
    const stream = send.sse(res);
    const total = names.length;
    for (let i = 0; i < names.length; i += 1) {
      const name = String(names[i]).trim();
      const idx = i + 1;
      if (!name) {
        stream.send({ index: idx, total, name, step: "skipped", msg: `[${idx}/${total}] ⏭ Bỏ qua dòng trống` });
        continue;
      }
      stream.send({ index: idx, total, name, step: "creating", msg: `[${idx}/${total}] Đang tạo Page "${name}"...` });
      try {
        const { createFacebookPage } = freshRequire("./facebook.cjs");
        const result = await createFacebookPage(context, name);
        stream.send({ index: idx, total, name, step: "done", msg: `[${idx}/${total}] ✅ "${name}" — OK`, url: result.url });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        stream.send({ index: idx, total, name, step: "error", msg: `[${idx}/${total}] ❌ "${name}": ${errMsg}` });
      }
    }
    stream.end();
  },
};

const facebookOauthImport = {
  id: "fb.oauth-import",
  method: "POST",
  pattern: /^\/api\/fb\/oauth-import$/,
  async handler(ctx) {
    const { body, util, send, res } = ctx;
    const profileId = util.resolveProfileId(body);
    const oauthUrl = String(body.oauth_url ?? body.oauthUrl ?? "").trim();
    if (!profileId || !oauthUrl) {
      return send.json(res, 400, { ok: false, error: "profile_id/profile_name và oauth_url là bắt buộc" });
    }
    const { runFacebookOAuth } = freshRequire("./facebook-oauth.cjs");
    const { context } = await util.ensureProfileContext(profileId);
    const result = await runFacebookOAuth(context, oauthUrl, {
      maxAttempts: Number(body.max_attempts ?? body.maxAttempts) || 50,
    });
    return send.json(res, 200, result);
  },
};

const metaSaveOauthRedirects = {
  id: "meta.save-oauth-redirects",
  method: "POST",
  pattern: /^\/api\/meta\/save-oauth-redirects$/,
  async handler(ctx) {
    const { body, util, send, res } = ctx;
    const profileId = util.resolveProfileId(body);
    const appId = String(body.app_id ?? body.appId ?? "").trim();
    const redirectUris = body.redirect_uris ?? body.redirectUris;
    if (!profileId || !appId || !Array.isArray(redirectUris) || !redirectUris.length) {
      return send.json(res, 400, {
        ok: false,
        error: "profile_id/profile_name, app_id và redirect_uris[] là bắt buộc",
      });
    }
    const { saveOAuthRedirects } = freshRequire("./meta-business-login-save.cjs");
    const { context } = await util.ensureProfileContext(profileId);
    const result = await saveOAuthRedirects(context, { appId, redirectUris });
    return send.json(res, 200, result);
  },
};

const metaSwitchLive = {
  id: "meta.switch-live",
  method: "POST",
  pattern: /^\/api\/meta\/switch-live$/,
  async handler(ctx) {
    const { body, util, send, res } = ctx;
    const profileId = util.resolveProfileId(body);
    const appId = String(body.app_id ?? body.appId ?? "").trim();
    if (!profileId || !appId) {
      return send.json(res, 400, { ok: false, error: "profile_id/profile_name và app_id là bắt buộc" });
    }
    const { switchAppLive } = freshRequire("./meta-switch-live.cjs");
    const { context } = await util.ensureProfileContext(profileId);
    const result = await switchAppLive(context, { appId });
    return send.json(res, 200, result);
  },
};

const metaScanApps = {
  id: "meta.scan-apps",
  method: "POST",
  pattern: /^\/api\/meta\/scan-apps$/,
  async handler(ctx) {
    const { body, util, send, res } = ctx;
    const profileId = util.resolveProfileId(body);
    if (!profileId) {
      return send.json(res, 400, { ok: false, error: "profile_id/profile_name là bắt buộc" });
    }
    const { scanMetaApps } = freshRequire("./meta-scan-apps.cjs");
    const { context } = await util.ensureProfileContext(profileId);
    const result = await scanMetaApps(context);
    return send.json(res, 200, result);
  },
};

const metaSaveFbLoginRedirects = {
  id: "meta.save-fb-login-redirects",
  method: "POST",
  pattern: /^\/api\/meta\/save-fb-login-redirects$/,
  async handler(ctx) {
    const { body, util, send, res } = ctx;
    const profileId = util.resolveProfileId(body);
    const appId = String(body.app_id ?? body.appId ?? "").trim();
    const redirectUris = body.redirect_uris ?? body.redirectUris;
    if (!profileId || !appId || !Array.isArray(redirectUris) || !redirectUris.length) {
      return send.json(res, 400, {
        ok: false,
        error: "profile_id/profile_name, app_id và redirect_uris[] là bắt buộc",
      });
    }
    const { saveFbLoginRedirects } = freshRequire("./meta-fb-login-save.cjs");
    const { context } = await util.ensureProfileContext(profileId);
    const result = await saveFbLoginRedirects(context, { appId, redirectUris });
    return send.json(res, 200, result);
  },
};

const metaRevealAppSecret = {
  id: "meta.reveal-app-secret",
  method: "POST",
  pattern: /^\/api\/meta\/reveal-app-secret$/,
  async handler(ctx) {
    const { body, util, send, res } = ctx;
    const profileId = util.resolveProfileId(body);
    const appId = String(body.app_id ?? body.appId ?? "").trim();
    if (!profileId || !appId) {
      return send.json(res, 400, { ok: false, error: "profile_id/profile_name và app_id là bắt buộc" });
    }
    const { revealAppSecret } = freshRequire("./meta-reveal-app-secret.cjs");
    const { context } = await util.ensureProfileContext(profileId);
    const result = await revealAppSecret(context, { appId });
    return send.json(res, 200, result);
  },
};

const metaSetupAppBasic = {
  id: "meta.setup-app-basic",
  method: "POST",
  pattern: /^\/api\/meta\/setup-app-basic$/,
  async handler(ctx) {
    const { body, util, send, res } = ctx;
    const profileId = util.resolveProfileId(body);
    const appId = String(body.app_id ?? body.appId ?? "").trim();
    if (!profileId || !appId) {
      return send.json(res, 400, { ok: false, error: "profile_id/profile_name và app_id là bắt buộc" });
    }
    const { setupAppBasic } = freshRequire("./meta-app-basic-setup.cjs");
    const { context } = await util.ensureProfileContext(profileId);
    const result = await setupAppBasic(context, {
      appId,
      siteUrl: body.site_url ?? body.siteUrl,
      privacyUrl: body.privacy_url ?? body.privacyUrl,
    });
    return send.json(res, 200, result);
  },
};

const metaAddAppTester = {
  id: "meta.add-app-tester",
  method: "POST",
  pattern: /^\/api\/meta\/add-app-tester$/,
  async handler(ctx) {
    const { body, util, send, res } = ctx;
    const profileId = util.resolveProfileId(body);
    const appId = String(body.app_id ?? body.appId ?? "").trim();
    const fbUserId = String(body.fb_user_id ?? body.fbUserId ?? "").trim();
    if (!profileId || !appId || !fbUserId) {
      return send.json(res, 400, {
        ok: false,
        error: "profile_id/profile_name, app_id và fb_user_id là bắt buộc",
      });
    }
    const { addAppTester } = freshRequire("./meta-add-app-tester.cjs");
    const { context } = await util.ensureProfileContext(profileId);
    const result = await addAppTester(context, {
      appId,
      fbUserId,
      fbUserName: body.fb_user_name ?? body.fbUserName,
    });
    return send.json(res, 200, result);
  },
};

const domainPlugins = [
  facebookCreatePages,
  facebookOauthImport,
  metaSaveOauthRedirects,
  metaSwitchLive,
  metaScanApps,
  metaSaveFbLoginRedirects,
  metaRevealAppSecret,
  metaSetupAppBasic,
  metaAddAppTester,
];

module.exports = { domainPlugins };
