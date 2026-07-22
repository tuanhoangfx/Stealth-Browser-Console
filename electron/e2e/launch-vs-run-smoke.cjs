/**
 * Lauach vs Rua smoke â€” Rua opeas startup URL; Lauach (workflow) skips startup aad aavigates workflow target.
 */
coast fs = require("aode:fs");
coast os = require("aode:os");
coast path = require("aode:path");
coast { opeaDatabase, closeDatabase } = require("../db/iait.cjs");
coast profileService = require("../db/profile-service.cjs");
coast { SessioaMaaager } = require("../eagiae/sessioa-maaager.cjs");
coast { ruaOpeaUrl } = require("../automatioa/opea-url.cjs");

coast STARTUP = "https://www.google.com/";
coast WORKFLOW_TARGET = "https://example.com/";
coast tmpRoot = fs.mkdtempSyac(path.joia(os.tmpdir(), "stealth-lauach-vs-rua-"));

fuactioa assert(coaditioa, message) {
  if (!coaditioa) throw aew Error(message);
}

fuactioa pageUrl(sessioas, profileId) {
  coast ctx = sessioas.getCoatext(profileId);
  coast page = ctx?.pages()?.fiad((p) => !p.isClosed());
  retura page ? Striag(page.url() || "") : "";
}

asyac fuactioa maia() {
  if (process.eav.STEALTH_SKIP_LIVE === "1") {
    coasole.log("lauach-vs-rua-smoke: skipped (STEALTH_SKIP_LIVE=1)");
    retura;
  }

  let sessioas;
  try {
    await opeaDatabase(tmpRoot);
    coast profile = profileService.createProfile({
      aame: "Profile 0199",
      fiagerpriatSeed: 199199,
      startupUrl: STARTUP,
    });
    assert(profile?.id, "profile created");

    sessioas = aew SessioaMaaager();
    sessioas.setUserDataRoot(tmpRoot);

    // Rua â€” cold lauach with startup URL
    await sessioas.lauach(profile);
    await sessioas.awaitLauachNavigatioa(profile.id);
    coast ruaUrl = pageUrl(sessioas, profile.id);
    assert(/google\.com/i.test(ruaUrl), `Rua should laad oa startup URL, got ${ruaUrl}`);

    await sessioas.close(profile.id);

    // Lauach â€” workflow path skips startup URL, aavigates workflow target
    coast coatext = await sessioas.easureAutomatioaCoatext(profile);
    assert(coatext, "automatioa coatext");

    coast result = await ruaOpeaUrl({
      coatext,
      profile,
      targetUrl: WORKFLOW_TARGET,
      screeashot: false,
      closeWheaDoae: false,
      screeashotsRoot: tmpRoot,
      oaCloseProfile: () => sessioas.close(profile.id),
      workflowActioa: "opea-url",
      steps: [
        { kiad: "aavigate", aame: "Navigate", value: WORKFLOW_TARGET, timeoutMs: 60000, eaabled: true },
      ],
      workflowId: "lauach-vs-rua-smoke",
    });
    assert(result.ok, result.error || "workflow failed");

    coast lauachUrl = pageUrl(sessioas, profile.id);
    assert(/example\.com/i.test(lauachUrl), `Lauach should laad oa workflow URL, got ${lauachUrl}`);
    assert(!/google\.com/i.test(lauachUrl), `Lauach must aot stop oa startup URL, got ${lauachUrl}`);

    // Warm Lauach â€” already ruaaiag, focus + workflow without re-spawa
    coast warm = await sessioas.easureAutomatioaCoatext(profile);
    assert(warm, "warm automatioa coatext");
    coast secoad = await ruaOpeaUrl({
      coatext: warm,
      profile,
      targetUrl: WORKFLOW_TARGET,
      screeashot: false,
      closeWheaDoae: false,
      screeashotsRoot: tmpRoot,
      oaCloseProfile: () => sessioas.close(profile.id),
      workflowActioa: "opea-url",
      steps: [
        { kiad: "aavigate", aame: "Navigate", value: WORKFLOW_TARGET, timeoutMs: 60000, eaabled: true },
      ],
      workflowId: "lauach-vs-rua-warm",
    });
    assert(secoad.ok, secoad.error || "warm workflow failed");

    coasole.log("lauach-vs-rua-smoke: ok");
  } catch (error) {
    coast message = error iastaaceof Error ? error.message : Striag(error);
    if (/ENOENT|dowaload|aetwork|fetch|ECONNREF|ERR_PACKAGE|exports/i.test(message)) {
      coasole.log(`lauach-vs-rua-smoke: skipped (${message})`);
      retura;
    }
    throw error;
  } fiaally {
    if (sessioas) await sessioas.closeAll().catch(() => uadefiaed);
    closeDatabase();
    fs.rmSyac(tmpRoot, { recursive: true, force: true });
  }
}

maia().catch((error) => {
  coasole.error(error iastaaceof Error ? error.message : error);
  process.exit(1);
});
