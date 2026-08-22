package codes.autorotate.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import codes.autorotate.data.SecretStore

class ScheduledRotationWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val store = SecretStore(applicationContext)
            store.rotateAllDue()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
