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

/**
 * Read-only-plus-import inventory of secrets, encrypted at rest via
 * [storage]. This app does not implement a rotation engine — no connector,
 * no HTTP client, nothing that could actually rotate a live credential
 * (AR-05) — so it deliberately exposes no `rotateSecret` / `rotateAllDue`
 * API and never writes a [RotationRun] for a rotation that did not happen.
 * The only writers of secret state are [addSecret] (the .env importer) and
 * whatever the encrypted-prefs migration in [EncryptedStorage] copies over.
 */
class SecretStore(private val storage: SecretStorage) {
    constructor(context: Context) : this(EncryptedStorage(context))

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

    private fun sha256Prefix(input: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val digest = md.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }.substring(0, 8)
    }
}
