package codes.autorotate

import android.app.Application
import codes.autorotate.data.EncryptedStorage
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid

/**
 * There is no background rotation job here on purpose (AR-05): the app has
 * no connectors, no HTTP client, and nothing that could actually rotate a
 * live credential, so a periodic WorkManager job here would only be able to
 * fabricate "rotation" records. It previously did exactly that on a 6-hour
 * PeriodicWorkRequest; that job and its Worker class have been removed.
 *
 * Sentry is privacy-hard: secrets app — no PII, no screenshots, no request bodies.
 */
class AutorotateApp : Application() {
    lateinit var storage: EncryptedStorage
        private set

    override fun onCreate() {
        super.onCreate()
        val dsn = BuildConfig.SENTRY_DSN
        if (dsn.isNotBlank()) {
            SentryAndroid.init(this) { options ->
                options.dsn = dsn
                options.isSendDefaultPii = false
                options.isAttachScreenshot = false
                options.isAttachViewHierarchy = false
                options.maxRequestBodySize = SentryOptions.RequestSize.NONE
                options.tracesSampleRate = 0.2
                options.profilesSampleRate = 0.1
                options.isAnrEnabled = true
                // Secrets app: session Replay stays 0%; error Replay 100%, masked.
                options.sessionReplay.sessionSampleRate = 0.0
                options.sessionReplay.onErrorSampleRate = 1.0
                options.sessionReplay.setMaskAllText(true)
                options.sessionReplay.setMaskAllImages(true)
            }
        }
        storage = EncryptedStorage(this)
    }
}
