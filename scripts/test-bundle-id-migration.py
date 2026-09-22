#!/usr/bin/env python3
"""Regression checks for the iOS bundle-ID migration contract."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
prompt = (root / "apple/Autorotate-iOS/AppUpdatePrompt.swift").read_text()
rollout = (root / "docs/rollouts/2026-09-22-bundle-id-migration.md").read_text()

assert '"codes.autorotate.ios": "codes.autorotate"' in prompt
assert "manifestEntry(for: config.bundleId, manifest: manifest)" in prompt
assert "CC8UTF7ATG.codes.autorotate.ios" in rollout
assert "new App Store Connect app record" in rollout
assert "before the first upload" in rollout
assert "Universal Links for `app.botfleet.ios`" not in rollout
print("bundle-ID migration checks passed")
