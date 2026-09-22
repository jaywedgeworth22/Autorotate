import Foundation
import Sentry

/// Native Sentry crash reporting and telemetry for Autorotate iOS.
///
/// DSN is read only from Info.plist (`SENTRY_DSN`).  There is no hardcoded
/// fallback — missing or empty skips init so a leaked default cannot be
/// pointed at the wrong project.
enum SentryTelemetry {
    static func start() {
        let dsn = (Bundle.main.object(forInfoDictionaryKey: "SENTRY_DSN") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !dsn.isEmpty else { return }

        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = "production"
            options.releaseName = releaseName()
            options.tracesSampleRate = 0.2
            options.profilesSampleRate = 0.1
            options.enableAppHangTracking = true
            options.appHangTimeoutInterval = 2.0
            options.enableCaptureFailedRequests = true
            options.failedRequestStatusCodes = [HttpStatusCodeRange(min: 500, max: 599)]
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            options.sendDefaultPii = false
            options.sessionReplay.sessionSampleRate = 0
            options.sessionReplay.onErrorSampleRate = 1.0
            options.sessionReplay.maskAllText = true
            options.sessionReplay.maskAllImages = true
            options.beforeSend = { event in
                if let request = event.request, let url = request.url {
                    var sanitized = url
                    for param in ["token", "key", "secret", "auth", "password"] {
                        sanitized = sanitized.replacingOccurrences(
                            of: "([?&]\(param)=)[^&#\\s]+",
                            with: "$1[REDACTED]",
                            options: .regularExpression
                        )
                    }
                    request.url = sanitized
                }
                return event
            }
        }
    }

    /// `<bundle-id>@<CFBundleShortVersionString>+<CFBundleVersion>`, e.g.
    /// `codes.autorotate.ios@1.0+3` — matches Sentry's own default Cocoa release
    /// format, set explicitly here so it never depends on SDK-version
    /// defaulting behavior.
    private static func releaseName() -> String {
        let info = Bundle.main.infoDictionary
        let version = (info?["CFBundleShortVersionString"] as? String) ?? "0.0"
        let build = (info?["CFBundleVersion"] as? String) ?? "0"
        let bundleId = Bundle.main.bundleIdentifier ?? "codes.autorotate.ios"
        return "\(bundleId)@\(version)+\(build)"
    }
}
