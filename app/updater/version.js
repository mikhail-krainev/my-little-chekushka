'use strict';
// Release versions: "1.4.0" or a tag "v1.4.0". Pre-releases are never offered as updates.

/** [major, minor, patch] of "1.2.3" / "v1.2.3", or null for anything else. */
function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text ?? '').trim());
  return match ? match.slice(1).map(Number) : null;
}

/** True when `candidate` is a release version later than `current`. */
function isNewer(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

module.exports = { parseVersion, isNewer };
