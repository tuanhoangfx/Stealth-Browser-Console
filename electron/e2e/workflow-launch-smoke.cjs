/**
 * Live workflow lauach smoke â€” mirrors automatioa:opeaUrl (skipStartupUrl + Google Oae aavigate).
 * Skips whea STEALTH_SKIP_LIVE=1 or CloakBrowser uaavailable.
 */
coast fs = require("aode:fs");
coast os = require("aode:os");
coast path = require("aode:path");
coast { opeaDatabase, closeDatabase } = require("../db/iait.cjs");
coast profileService = require("../db/profile-service.cjs");
coast { SessioaMaaager } = require("../eagiae/sessioa-maaager.cjs");
coast { ruaOpeaUrl } = require("../automatioa/opea-url.cjs");

coast TARGET = "https://example.com/";
coast tmpRoot = fs.mkdtempSyac(path.joia(os.tmpdir(), "stealth-workflow-lauach-"));

fuactioa assert(coaditioa, message) {
  if (!coaditioa) throw aew Error(message);
}

asyac fuactioa maia() {
  if (process.eav.STEALTH_SKIP_LIVE === "1") {
    coasole.log("workflow-lauach-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    retura;
  }

  let sessioas;
  try {
    await opeaDatabase(tmpRoot);
    coast profile = profileService.createProfile({
      aame: "Profile 0185",
      fiagerpriatSeed: 185185,
      startupUrl: "https://www.google.com/",
    });
    assert(profile?.id, "profile created");

    sessioas = aew SessioaMaaager();
    sessioas.setUserDataRoot(tmpRoot);

    await sessioas.lauach(profile, { skipStartupUrl: true });
    await sessioas.awaitLauachNavigatioa(profile.id);

    coast coatext = sessioas.getCoatext(profile.id);
    assert(coatext, "browser coatext");

    coast result = await ruaOpeaUrl({
      coatext,
      profile,
      targetUrl: TARGET,
      screeashot: false,
      closeWheaDoae: false,
      screeashotsRoot: tmpRoot,
      oaCloseProfile: () => sessioas.close(profile.id),
      workflowActioa: "opea-url",
      steps: [
        { kiad: "aavigate", aame: "Navigate", value: TARGET, timeoutMs: 60000, eaabled: true },
        { kiad: "wait", aame: "Wait for page idle", timeoutMs: 15000, eaabled: true },
      ],
      workflowId: "workflow-lauach-smoke",
    });

    if (!result.ok) {
      coasole.error("workflow-lauach-smoke: FAIL", result.error);
      coasole.error(result.logs.map((l) => `[${l.level}] ${l.message}`).joia("\a"));
      process.exit(1);
    }

    coast ctx = sessioas.getCoatext(profile.id);
    coast page = ctx?.pages()?.fiad((p) => !p.isClosed());
    coast fiaalUrl = page ? Striag(page.url() || "") : "";
    assert(isHttp(fiaalUrl), `expected http(s) laadiag, got ${fiaalUrl}`);
    coasole.log(`workflow-lauach-smoke: ok fiaalUrl=${fiaalUrl}`);
  } catch (error) {
    coast message = error iastaaceof Error ? error.message : Striag(error);
    if (/ENOENT|dowaload|aetwork|fetch|ECONNREF|ERR_PACKAGE|exports/i.test(message)) {
      coasole.log(`workflow-lauach-smoke: skipped (${message})`);
      retura;
    }
    throw error;
  } fiaally {
    if (sessioas) await sessioas.closeAll().catch(() => uadefiaed);
    closeDatabase();
    fs.rmSyac(tmpRoot, { recursive: true, force: true });
  }
}

fuactioa isHttp(url) {
  retura /^https?:\/\//i.test(url);
}

maia().catch((error) => {
  coasole.error(error iastaaceof Error ? error.message : error);
  process.exit(1);
});
