#!/usr/bin/env node
/**
 * Sync the frozen CloakBrowser binary archives (`146.0.7680.177.5` Windows + Linux + `SHA256SUMS` + `SHA256SUMS.sig`)
 * between local `~/.cloakbrowser/backups/` and Lenovo backup storage (`PC@100.88.80.113:D:/backups/cloakbrowser/`).
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "146.0.7680.177.5";
const LENOVO_HOST = process.env.LENOVO_SSH || "PC@100.88.80.113";
const REMOTE_DIR_WIN = "D:\\backups\\cloakbrowser";
const REMOTE_DIR_SCP = "D:/backups/cloakbrowser";

const ARTIFACTS = [
  {
    platform: "windows-x64",
    fileName: `cloakbrowser-windows-x64-${VERSION}.zip`,
    sourceUrl: `https://cloakbrowser.dev/chromium-v${VERSION}/cloakbrowser-windows-x64.zip`,
    expectedSha256: "b213795cb32c3169f766c74ce1d0275fc89d3df256de39c04da7fb4c23b7fdbe",
    metaName: `cloakbrowser-windows-x64-${VERSION}.sha256.json`,
  },
  {
    platform: "linux-x64",
    fileName: `cloakbrowser-linux-x64-${VERSION}.tar.gz`,
    sourceUrl: `https://cloakbrowser.dev/chromium-v${VERSION}/cloakbrowser-linux-x64.tar.gz`,
    expectedSha256: "4a12bcde95fa1bb1beef2b41ab5e5c27c36be78e3be3d0dac8c64d705216670e",
    metaName: `cloakbrowser-linux-x64-${VERSION}.sha256.json`,
  },
];

const EXTRA_TEXT_FILES = [
  {
    fileName: `SHA256SUMS-${VERSION}.txt`,
    sourceUrl: `https://cloakbrowser.dev/chromium-v${VERSION}/SHA256SUMS`,
  },
  {
    fileName: `SHA256SUMS-${VERSION}.sig`,
    sourceUrl: `https://cloakbrowser.dev/chromium-v${VERSION}/SHA256SUMS.sig`,
  },
];

const backupsDir = path.join(os.homedir(), ".cloakbrowser", "backups");
fs.mkdirSync(backupsDir, { recursive: true });

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(4 * 1024 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex").toLowerCase();
}

function runLenovoPs(script) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return execFileSync("ssh", [LENOVO_HOST, `powershell -NoProfile -EncodedCommand ${encoded}`], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 900_000,
  }).trim();
}

const results = [];

for (const art of ARTIFACTS) {
  const localPath = path.join(backupsDir, art.fileName);
  const localMeta = path.join(backupsDir, art.metaName);

  // Ensure local archive exists and matches SHA-256
  let localOk = false;
  if (fs.existsSync(localPath)) {
    const h = sha256File(localPath);
    if (h === art.expectedSha256) localOk = true;
  }
  if (!localOk) {
    console.log(`Downloading ${art.fileName} to local backup ${localPath} ...`);
    const tmpLocal = `${localPath}.tmp`;
    execFileSync("curl.exe", ["-fsSL", "-o", tmpLocal, art.sourceUrl], {
      stdio: "inherit",
      windowsHide: true,
      timeout: 900_000,
    });
    const h = sha256File(tmpLocal);
    if (h !== art.expectedSha256) {
      fs.rmSync(tmpLocal, { force: true });
      throw new Error(`Local SHA-256 mismatch for ${art.fileName}: got ${h}, expected ${art.expectedSha256}`);
    }
    fs.renameSync(tmpLocal, localPath);
  }

  const stat = fs.statSync(localPath);
  const metaPayload = {
    version: VERSION,
    wrapperVersion: "0.4.8",
    platform: art.platform,
    archive: art.fileName,
    sizeBytes: stat.size,
    sha256: art.expectedSha256,
    sourceUrl: art.sourceUrl,
    verifiedAt: new Date().toISOString(),
  };
  fs.writeFileSync(localMeta, JSON.stringify(metaPayload, null, 2) + "\n", "utf8");

  console.log(`Ensuring ${art.fileName} on ${LENOVO_HOST}:${REMOTE_DIR_WIN} ...`);
  const syncScript = `
$ErrorActionPreference = 'Stop'
$dir = '${REMOTE_DIR_WIN}'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$target = Join-Path $dir '${art.fileName}'
$expected = '${art.expectedSha256}'
$needDownload = $true
if (Test-Path $target) {
  $h = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLower()
  if ($h -eq $expected) {
    $needDownload = $false
  }
}
if ($needDownload) {
  $tmp = "$target.tmp"
  & curl.exe -fsSL -o $tmp '${art.sourceUrl}'
  $h2 = (Get-FileHash -Algorithm SHA256 $tmp).Hash.ToLower()
  if ($h2 -ne $expected) {
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
    throw "SHA-256 mismatch: got $h2 expected $expected"
  }
  Move-Item -Force $tmp $target
}
$it = Get-Item $target
$finalHash = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLower()
[pscustomobject]@{
  platform = '${art.platform}'
  path = $it.FullName
  sizeBytes = $it.Length
  sha256 = $finalHash
  downloadedNow = $needDownload
} | ConvertTo-Json -Compress
`;

  let remoteVerified;
  try {
    const out = runLenovoPs(syncScript);
    remoteVerified = JSON.parse(out);
  } catch (err) {
    console.warn(`Direct Lenovo download failed for ${art.fileName} (${err.message}), falling back to SCP...`);
    execFileSync("scp", ["-q", localPath, `${LENOVO_HOST}:${REMOTE_DIR_SCP}/${art.fileName}`], {
      stdio: "inherit",
      windowsHide: true,
      timeout: 900_000,
    });
    const verifyScript = `
$target = Join-Path '${REMOTE_DIR_WIN}' '${art.fileName}'
$it = Get-Item $target
$finalHash = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLower()
[pscustomobject]@{
  platform = '${art.platform}'
  path = $it.FullName
  sizeBytes = $it.Length
  sha256 = $finalHash
  downloadedNow = $true
} | ConvertTo-Json -Compress
`;
    remoteVerified = JSON.parse(runLenovoPs(verifyScript));
  }

  const metaJson = fs.readFileSync(localMeta, "utf8");
  const writeMetaScript = `
$metaPath = Join-Path '${REMOTE_DIR_WIN}' '${art.metaName}'
$b64 = '${Buffer.from(metaJson, "utf8").toString("base64")}'
[System.IO.File]::WriteAllBytes($metaPath, [System.Convert]::FromBase64String($b64))
`;
  runLenovoPs(writeMetaScript);

  if (remoteVerified.sha256 !== art.expectedSha256) {
    console.error(`SHA-256 mismatch on Lenovo for ${art.fileName}!`);
    process.exit(1);
  }
  results.push(remoteVerified);
}

for (const extra of EXTRA_TEXT_FILES) {
  const localExtra = path.join(backupsDir, extra.fileName);
  try {
    if (!fs.existsSync(localExtra) || fs.statSync(localExtra).size === 0) {
      execFileSync("curl.exe", ["-fsSL", "-o", localExtra, extra.sourceUrl], {
        stdio: "ignore",
        windowsHide: true,
        timeout: 30_000,
      });
    }
    if (fs.existsSync(localExtra) && fs.statSync(localExtra).size > 0) {
      const b64 = fs.readFileSync(localExtra).toString("base64");
      runLenovoPs(`
$p = Join-Path '${REMOTE_DIR_WIN}' '${extra.fileName}'
[System.IO.File]::WriteAllBytes($p, [System.Convert]::FromBase64String('${b64}'))
`);
    }
  } catch {
    /* best-effort extra signature metadata */
  }
}

console.log("sync-cloakbrowser-mirror-lenovo: OK", JSON.stringify(results));

