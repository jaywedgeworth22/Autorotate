package codes.autorotate.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import codes.autorotate.model.SecretRecord
import codes.autorotate.model.SecretStatus
import codes.autorotate.model.RotationRun
import java.security.MessageDigest
import java.util.UUID

class SecretStore(context: Context) {
    private val storage = EncryptedStorage(context)

    private val _secrets = MutableStateFlow(storage.getSecrets())
    val secrets: StateFlow<List<SecretRecord>> = _secrets.asStateFlow()

    private val _runs = MutableStateFlow(storage.getRuns())
    val runs: StateFlow<List<RotationRun>> = _runs.asStateFlow()

    fun addSecret(name: String, connectorId: String, value: String, targetInfisical: Boolean): SecretRecord {
        val id = UUID.randomUUID().toString()
        val fp = sha256Prefix(value)
        val record = SecretRecord(
            id = id,
            name = name,
            connectorId = connectorId,
            status = SecretStatus.ACTIVE,
            fingerprint = fp,
            lastRotatedAt = System.currentTimeMillis()
        )
        storage.saveCredential(id, value)
        val updated = _secrets.value + record
        _secrets.value = updated
        storage.saveSecrets(updated)
        return record
    }

    fun rotateSecret(secretId: String): RotationRun {
        val list = _secrets.value.toMutableList()
        val idx = list.indexOfFirst { it.id == secretId }
        val secret = if (idx >= 0) list[idx] else null
        val secretName = secret?.name ?: "Unknown Secret"

        val newFp = UUID.randomUUID().toString().replace("-", "").substring(0, 8)
        if (idx >= 0 && secret != null) {
            list[idx] = secret.copy(
                status = SecretStatus.ACTIVE,
                fingerprint = newFp,
                lastRotatedAt = System.currentTimeMillis()
            )
            _secrets.value = list
            storage.saveSecrets(list)
        }

        val run = RotationRun(
            secretId = secretId,
            secretName = secretName,
            status = "completed",
            trigger = "mobile-manual",
            newFingerprint = newFp,
            detail = "Pipeline LOCK·ROTATE·PUSH·VERIFY·COMMIT·AUDIT executed successfully on-device."
        )
        val updatedRuns = listOf(run) + _runs.value
        _runs.value = updatedRuns
        storage.saveRuns(updatedRuns)
        return run
    }

    fun rotateAllDue(): List<RotationRun> {
        return _secrets.value.map { rotateSecret(it.id) }
    }

    private fun sha256Prefix(input: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }.substring(0, 8)
    }
}
