# macOS LaunchAgent — `com.jays.autorotate.scheduler`

AR31-33 (2026-09-20): the Autorotate-macOS app uses an in-process `Timer` in `RotationScheduler` to drive due-secret rotations every N minutes.  Without a LaunchAgent the process exits when the last window closes, the menu bar (`NSStatusItem`) disappears, and scheduled rotations silently stop until the user re-opens the app.

This LaunchAgent keeps the .app resident:

- **Auto-launch** on login and reboot.
- **Auto-restart** on crash (without spinning on a truly broken build — `ThrottleInterval: 30` caps the loop).
- **Wait for the network** so the first rotation tick does not race DNS.

## Installation (one-time per fleet Mac)

```bash
# 1. Build Release and install under /Applications.
xcodebuild -scheme Autorotate-macOS -configuration Release
cp -R build/Release/Autorotate.app /Applications/

# 2. Copy the plist into your user LaunchAgents.
cp scripts/launchagents/com.jays.autorotate.scheduler.plist \
   ~/Library/LaunchAgents/

# 3. Load it.
launchctl load -w ~/Library/LaunchAgents/com.jays.autorotate.scheduler.plist

# 4. Verify the agent is registered.
launchctl list | grep com.jays.autorotate.scheduler
```

To change the install path of the .app, edit the `ProgramArguments` array inside the plist before the `launchctl load`.

## Removal

```bash
launchctl unload ~/Library/LaunchAgents/com.jays.autorotate.scheduler.plist
rm ~/Library/LaunchAgents/com.jays.autorotate.scheduler.plist
```

## Logs

- Standard output: `/tmp/com.jays.autorotate.scheduler.out.log`
- Standard error: `/tmp/com.jays.autorotate.scheduler.err.log`

Tail with `tail -F` while troubleshooting, e.g.:

```bash
tail -F /tmp/com.jays.autorotate.scheduler.err.log
```

## Owner follow-up

Per the umbrella issue #240, owner action is required once per fleet Mac:

1. Decide which Mac(s) should run scheduled rotations unattended.
2. Run the install block above on each.
3. Verify the agent re-opens the app after `pkill Autorotate`.
