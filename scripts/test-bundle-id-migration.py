#!/usr/bin/env python3
"""Regression checks for the iOS bundle-ID migration contract."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
prompt = (root / "apple/Autorotate-iOS/AppUpdatePrompt.swift").read_text()
rollout = (root / "docs/rollouts/2026-09-22-bundle-id-migration.md").read_text()

assert '"codes.autorotate.ios": "codes.autorotate"' not in prompt
assert "manifestBundleAliases" not in prompt
assert "manifest?.apps[bundleId]" in prompt
assert "legacyEntry" not in prompt
assert "legacy-only manifest produces no update offer" in rollout
assert "Do not invent or reuse an Apple ID" in rollout
assert "CC8UTF7ATG.codes.autorotate.ios" in rollout
assert '"webcredentials"' in rollout
assert '"apps": ["CC8UTF7ATG.codes.autorotate.ios"]' in rollout
assert "new App Store Connect app record" in rollout
assert "before the first upload" in rollout
assert "Universal Links for `app.botfleet.ios`" not in rollout
print("bundle-ID migration checks passed")
