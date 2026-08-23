/** In-memory Store update probe — no CRX download. Renderer updates the cache in the background. */

let snapshot = {
  checking: false,
  checkedAt: null,
  results: [],
};

function getStoreExtensionUpdateCheck() {
  return snapshot;
}

function setStoreExtensionUpdateCheck(next) {
  snapshot = {
    checking: Boolean(next.checking),
    checkedAt: next.checkedAt ?? snapshot.checkedAt,
    results: Array.isArray(next.results) ? next.results : snapshot.results,
  };
  return snapshot;
}

module.exports = {
  getStoreExtensionUpdateCheck,
  setStoreExtensionUpdateCheck,
};
