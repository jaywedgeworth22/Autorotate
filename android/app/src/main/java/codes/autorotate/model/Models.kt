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

/**
 * Shape of the JSON the web console's pairing QR code actually encodes today
 * (`apps/web/api/routers/autorotate.ts` `pairingRouter.getPayload`):
 * `{version, appName, baseUrl, environment, timestamp}`.
 *
 * Every field is nullable so a partial or malformed scan deserializes to
 * `null`s instead of Gson silently defeating Kotlin's non-null guarantees
 * (Gson populates fields via reflection and does not honor Kotlin
 * null-safety, so a "required" non-null field missing from the JSON would
 * otherwise become `null` at runtime anyway). [baseUrl] is the field this
 * app actually needs: the server has no `pairingToken` concept, so `baseUrl`
 * doubles as the pairing endpoint to connect to. See [QRPairingParser] for
 * validation and unknown-field tolerance (AR-20).
 */
data class QRPairingPayload(
    val version: Int? = null,
    val appName: String? = null,
    val baseUrl: String? = null,
    val environment: String? = null,
    val timestamp: String? = null
) {
    /** The pairing endpoint to connect to. The server names this field `baseUrl`. */
    val pairingEndpoint: String?
        get() = baseUrl
}
