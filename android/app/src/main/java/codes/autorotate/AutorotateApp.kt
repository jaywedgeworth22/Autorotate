package codes.autorotate

import android.app.Application
import codes.autorotate.data.EncryptedStorage

/**
 * There is no background rotation job here on purpose (AR-05): the app has
 * no connectors, no HTTP client, and nothing that could actually rotate a
 * live credential, so a periodic WorkManager job here would only be able to
 * fabricate "rotation" records. It previously did exactly that on a 6-hour
 * PeriodicWorkRequest; that job and its Worker class have been removed.
 */
class AutorotateApp : Application() {
    lateinit var storage: EncryptedStorage
        private set

    override fun onCreate() {
        super.onCreate()
        storage = EncryptedStorage(this)
    }
}
