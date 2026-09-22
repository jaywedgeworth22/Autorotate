#!/usr/bin/env python3
"""Regression checks for the iOS bundle-ID migration contract."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
prompt = (root / "apple/Autorotate-iOS/AppUpdatePrompt.swift").read_text()
rollout = (root / "docs/rollouts/2026-09-22-bundle-id-migration.md").read_text()

assert '"codes.autorotate.ios": "codes.autorotate"' in prompt
assert "manifestEntry(for: config.bundleId, manifest: manifest)" in prompt
# The legacy manifest key is version/build-only compatibility data. The old
# App Store Connect record's Apple ID and deep links must never cross the
# bundle rename boundary.
legacy_fallback = prompt.split("let legacyEntry = apps[alias]", 1)[1].split("struct ManifestFile", 1)[0]
assert "marketingVersion: legacyEntry.marketingVersion" in legacy_fallback
assert "build: legacyEntry.build" in legacy_fallback
assert "appleId: nil" in legacy_fallback
assert "testFlightURL: nil" in legacy_fallback
assert "appStoreURL: nil" in legacy_fallback
assert "CC8UTF7ATG.codes.autorotate.ios" in rollout
assert '"webcredentials"' in rollout
assert '"apps": ["CC8UTF7ATG.codes.autorotate.ios"]' in rollout
assert "new App Store Connect app record" in rollout
assert "before the first upload" in rollout
assert "Universal Links for `app.botfleet.ios`" not in rollout
print("bundle-ID migration checks passed")
