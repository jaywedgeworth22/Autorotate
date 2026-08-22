package codes.autorotate

import android.app.Application
import androidx.work.*
import codes.autorotate.data.EncryptedStorage
import codes.autorotate.worker.ScheduledRotationWorker
import java.util.concurrent.TimeUnit

class AutorotateApp : Application() {
    lateinit var storage: EncryptedStorage
        private set

    override fun onCreate() {
        super.onCreate()
        storage = EncryptedStorage(this)
        schedulePeriodicRotationCheck()
    }

    private fun schedulePeriodicRotationCheck() {
        val workRequest = PeriodicWorkRequestBuilder<ScheduledRotationWorker>(6, TimeUnit.HOURS)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "autorotate_scheduled_check",
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }
}
