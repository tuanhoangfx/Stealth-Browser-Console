let appQuitting = false;

function markAppQuitting() {
  appQuitting = true;
}

function isAppQuitting() {
  return appQuitting;
}

module.exports = { markAppQuitting, isAppQuitting };
