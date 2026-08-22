package codes.autorotate.model

import java.util.UUID

enum class SecretStatus(val rawValue: String) {
    ACTIVE("active"),
    OVERDUE("overdue"),
    ROTATING("rotating"),
    DRIFTED("drifted"),
    PAUSED("paused"),
    FAILED("failed")
}

data class RotationPolicy(
    val intervalDays: Int = 30,
    val gracePeriodHours: Int = 24,
    val autoRotate: Boolean = true
)

sealed class TargetBinding {
    data class Infisical(
        val workspaceId: String,
        val environment: String,
        val secretPath: String = "/",
        val secretName: String
    ) : TargetBinding()

    data class FileTarget(
        val path: String,
        val format: String,
        val key: String
    ) : TargetBinding()

    data class Webhook(
        val url: String,
        val headers: Map<String, String> = emptyMap()
    ) : TargetBinding()
}

data class SecretRecord(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val connectorId: String,
    val status: SecretStatus = SecretStatus.ACTIVE,
    val fingerprint: String = "e3b0c442",
    val policy: RotationPolicy = RotationPolicy(),
    val targets: List<TargetBinding> = emptyList(),
    val lastRotatedAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val note: String? = null
)

data class RotationRun(
    val id: String = UUID.randomUUID().toString(),
    val secretId: String,
    val secretName: String,
    val status: String,
    val trigger: String = "manual",
    val startedAt: Long = System.currentTimeMillis(),
    val completedAt: Long? = System.currentTimeMillis(),
    val newFingerprint: String? = null,
    val detail: String? = null
)

data class QRPairingPayload(
    val service: String = "Autorotate",
    val domain: String = "Autorotate.codes",
    val workspaceId: String,
    val environment: String,
    val endpoint: String,
    val pairingToken: String
)
