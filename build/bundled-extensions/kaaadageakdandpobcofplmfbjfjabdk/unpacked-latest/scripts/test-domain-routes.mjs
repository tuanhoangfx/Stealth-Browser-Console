import assert from "node:assert/strict";
import {
  claudeSessionUrl,
  describeSiteClearTarget,
  effectiveCookieDomain,
  elevenLabsSessionUrl,
  extraCookieQueryUrls,
  extraSetHostsForCookieHost,
  extractHostnameFromUrlOrDomain,
  extractRegistrableDomain,
  googleFlowPassiveLoginUrl,
  googleFlowSessionUrl,
  googleMailInboxUrl,
  hasGoogleFlowOsidCookie,
  isAdobeFamilyDomain,
  isClaudeFamilyDomain,
  isElevenLabsDomain,
  isGoogleDomain,
  isGoogleFlowDomain,
  isGoogleMarketingUrl,
  isMicrosoftOutlookFamilyDomain,
  isOpenAiFamilyDomain,
  isSpaStorageAuthDomain,
  openSiteHintHost,
  relatedCookieDomains,
  resolveSiteClearCookieDomains,
  shouldForceNavigateElevenLabsTab,
  shouldForceNavigateGoogleFlowTab,
  shouldForceNavigateGoogleTab,
  siteUrlForDomain,
  summarizeGoogleCookieNames,
  tabMatchesRoute,
} from "../domain-routes.js";
import { decryptVaultPayload, encryptVault } from "../vault-crypto.js";
import { extractSiteSessionIdentityHint } from "../site-cookie-cleaner.js";
import { extractAuthStorageIdentity, hasElevenLabsAuthSession } from "../site-auth-storage.js";

assert.equal(siteUrlForDomain(".google.com"), googleMailInboxUrl());
assert.equal(effectiveCookieDomain(".mail.google.com"), ".google.com");
assert.equal(isGoogleDomain("mail.google.com"), true);

assert.equal(isGoogleMarketingUrl("https://workspace.google.com/intl/en-US/gmail/"), true);
assert.equal(tabMatchesRoute("https://workspace.google.com/intl/en-US/gmail/", ".google.com"), false);
assert.equal(tabMatchesRoute("https://mail.google.com/mail/u/0/", ".mail.google.com"), true);
assert.equal(shouldForceNavigateGoogleTab("https://workspace.google.com/intl/en-US/gmail/", ".google.com"), true);

const googleHosts = extraSetHostsForCookieHost("google.com");
assert.ok(googleHosts.has("mail.google.com"));

const queryUrls = extraCookieQueryUrls(".mail.google.com");
assert.ok(queryUrls.includes("https://mail.google.com/"));

const login = summarizeGoogleCookieNames([{ name: "SID" }, { name: "HSID" }]);
assert.equal(login.hasGoogleLogin, true);

assert.equal(isClaudeFamilyDomain(".claude.com"), true);
assert.equal(isClaudeFamilyDomain(".claude.ai"), true);
assert.equal(isClaudeFamilyDomain("console.anthropic.com"), true);
assert.equal(siteUrlForDomain(".claude.com"), claudeSessionUrl());
assert.equal(openSiteHintHost(".claude.com"), "claude.ai");
assert.deepEqual(relatedCookieDomains(".claude.com"), [".claude.ai", ".claude.com", ".anthropic.com"]);
assert.ok(extraSetHostsForCookieHost("claude.com").has("claude.ai"));
assert.ok(extraCookieQueryUrls(".claude.com").includes("https://claude.ai/"));

assert.equal(tabMatchesRoute("https://claude.ai/", ".claude.com"), true);
assert.equal(tabMatchesRoute("https://www.claude.com/", ".claude.ai"), true);

assert.equal(extractHostnameFromUrlOrDomain("https://account.adobe.com/plans?lang=en"), "account.adobe.com");
assert.equal(extractRegistrableDomain("https://account.adobe.com/plans"), "adobe.com");
assert.equal(extractRegistrableDomain("https://outlook.live.com/mail/0/"), "live.com");
assert.equal(extractRegistrableDomain("https://databox.infi.io.vn/cookie"), "infi.io.vn");

assert.equal(isAdobeFamilyDomain("account.adobe.com"), true);
assert.equal(isAdobeFamilyDomain("ims-na1.adobelogin.com"), true);
assert.equal(isMicrosoftOutlookFamilyDomain("outlook.com"), true);
assert.equal(isMicrosoftOutlookFamilyDomain("outlook.live.com"), true);
assert.equal(isMicrosoftOutlookFamilyDomain("login.microsoftonline.com"), true);
assert.equal(isOpenAiFamilyDomain("chatgpt.com"), true);

const adobeClearScopes = resolveSiteClearCookieDomains("https://account.adobe.com/plans");
assert.ok(adobeClearScopes.includes(".adobe.com"));
assert.ok(adobeClearScopes.includes(".adobelogin.com"));
assert.ok(adobeClearScopes.includes(".adobe.io"));

const outlookClearScopes = resolveSiteClearCookieDomains("https://outlook.live.com/mail/0/");
assert.ok(outlookClearScopes.includes(".outlook.com"));
assert.ok(outlookClearScopes.includes(".live.com"));
assert.ok(outlookClearScopes.includes(".microsoftonline.com"));
assert.ok(outlookClearScopes.includes(".office.com"));

const adobeDesc = describeSiteClearTarget("https://www.adobe.com/");
assert.equal(adobeDesc.registrableDomain, "adobe.com");
assert.equal(adobeDesc.familyLabel, "Adobe SSO");
assert.ok(adobeDesc.scopes.length >= 4);

assert.equal(isElevenLabsDomain(".elevenlabs.io"), true);
assert.equal(isElevenLabsDomain("elevenlabs.io"), true);
assert.equal(isSpaStorageAuthDomain(".elevenlabs.io"), true);
assert.equal(siteUrlForDomain(".elevenlabs.io"), elevenLabsSessionUrl());
assert.equal(shouldForceNavigateElevenLabsTab("https://elevenlabs.io/app/sign-in", ".elevenlabs.io"), true);
assert.equal(shouldForceNavigateElevenLabsTab("https://elevenlabs.io/", ".elevenlabs.io"), true);
assert.equal(shouldForceNavigateElevenLabsTab("https://elevenlabs.io/app/home", ".elevenlabs.io"), false);

const elHint = extractSiteSessionIdentityHint("elevenlabs.io", [
  { name: "__sec_id", value: '{"username":"d2n86@outlook.com","type":"email"}' },
]);
assert.equal(elHint.isAuthenticated, true);
assert.equal(elHint.sessionHint, "d2n86@outlook.com");

const sampleStorage = {
  origin: "https://elevenlabs.io",
  localStorage: { "xi-preserve:auth_last_used": '"password"' },
  indexedDB: {
    firebaseLocalStorage: [
      {
        fbase_key: "firebase:authUser:AIzaSyBSsRE_1Os04-bxpd5JTLIniy3UK4OqKys:[DEFAULT]",
        value: {
          uid: "9UxZTJCwDRh9rPBwhT2jR1qQO6S2",
          email: "d2n86@outlook.com",
          stsTokenManager: { refreshToken: "AMf-sample" },
        },
      },
    ],
  },
};
const encVault = await encryptVault("", "167c10dd-ee5c-4a6a-bf73-ad38f16e0b4f", ".elevenlabs.io", [], sampleStorage);
assert.equal(encVault.cookieCount, 1);
const decVault = await decryptVaultPayload("", "167c10dd-ee5c-4a6a-bf73-ad38f16e0b4f", ".elevenlabs.io", encVault.ciphertext, encVault.iv);
assert.equal(decVault.storage?.indexedDB?.firebaseLocalStorage?.[0]?.value?.email, "d2n86@outlook.com");

const spaId = extractAuthStorageIdentity(sampleStorage);
assert.equal(spaId.isAuthenticated, true);
assert.equal(spaId.email, "d2n86@outlook.com");
assert.equal(hasElevenLabsAuthSession([], sampleStorage), true);
assert.equal(hasElevenLabsAuthSession([{ name: "_ga", value: "1" }], null), false);

assert.equal(isGoogleFlowDomain("flow.google.com"), true);
assert.equal(isGoogleFlowDomain(".flow.google.com"), true);
assert.equal(effectiveCookieDomain(".flow.google.com"), ".flow.google.com");
assert.equal(siteUrlForDomain(".flow.google.com"), googleFlowSessionUrl());
assert.deepEqual(relatedCookieDomains(".flow.google.com"), [".google.com", ".flow.google.com", ".labs.google"]);
assert.equal(isGoogleMarketingUrl("https://flow.google.com/about?pli=1"), true);
assert.equal(shouldForceNavigateGoogleFlowTab("https://flow.google.com/about?pli=1", ".flow.google.com"), true);
assert.equal(shouldForceNavigateGoogleFlowTab("https://flow.google.com/?pli=1", ".flow.google.com"), false);
assert.equal(hasGoogleFlowOsidCookie([{ name: "OSID", domain: "flow.google.com" }]), true);
assert.equal(hasGoogleFlowOsidCookie([{ name: "SID", domain: ".google.com" }]), false);
assert.ok(googleFlowPassiveLoginUrl().includes("accounts.google.com/ServiceLogin"));
assert.ok(extraSetHostsForCookieHost("google.com").has("flow.google.com"));
assert.ok(extraCookieQueryUrls(".flow.google.com").includes("https://flow.google.com/"));

console.log("test-domain-routes: OK");
