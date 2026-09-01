package codes.autorotate.data

import codes.autorotate.model.RotationRun
import codes.autorotate.model.SecretRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * In-memory [SecretStorage] fake so [SecretStore] can be exercised without
 * the real Android-Keystore-backed [EncryptedStorage], which needs a
 * device/emulator.
 */
private class FakeSecretStorage(
    initialSecrets: List<SecretRecord> = emptyList(),
    initialRuns: List<RotationRun> = emptyList()
) : SecretStorage {
    private var secrets = initialSecrets
    private var runs = initialRuns
    val savedCredentials = mutableMapOf<String, String>()

    override fun saveCredential(secretId: String, credential: String) {
        savedCredentials[secretId] = credential
    }

    override fun getCredential(secretId: String): String? = savedCredentials[secretId]

    override fun removeCredential(secretId: String) {
        savedCredentials.remove(secretId)
    }

    override fun saveSecrets(secrets: List<SecretRecord>) {
        this.secrets = secrets
    }

    override fun getSecrets(): List<SecretRecord> = secrets

    override fun saveRuns(runs: List<RotationRun>) {
        this.runs = runs
    }

    override fun getRuns(): List<RotationRun> = runs
}

/**
 * AR-05: this app has no rotation engine. These tests exist so that if
 * `rotateSecret` / `rotateAllDue` (or any equivalent) is ever reintroduced,
 * a run record appearing here will fail the suite instead of shipping
 * silently as a "successful" fabricated rotation.
 */
class SecretStoreTest {

    @Test
    fun `no run records exist on a fresh store`() {
        val store = SecretStore(FakeSecretStorage())

        assertTrue(store.runs.value.isEmpty())
    }

    @Test
    fun `addSecret never writes a run record`() {
        val fake = FakeSecretStorage()
        val store = SecretStore(fake)

        store.addSecret(
            name = "STRIPE_SECRET_KEY",
            connectorId = "stripe",
            value = "sk_live_example",
            targetInfisical = true
        )

        assertTrue(store.runs.value.isEmpty())
        assertTrue(fake.getRuns().isEmpty())
    }

    @Test
    fun `addSecret stores the credential and a real sha256 fingerprint, never the raw value as fingerprint`() {
        val fake = FakeSecretStorage()
        val store = SecretStore(fake)

        val record = store.addSecret(
            name = "GITHUB_TOKEN",
            connectorId = "github",
            value = "ghp_example_token",
            targetInfisical = false
        )

        assertEquals("ghp_example_token", fake.getCredential(record.id))
        assertEquals(8, record.fingerprint.length)
        assertTrue(record.fingerprint.all { it.isDigit() || it in 'a'..'f' })
        assertEquals(1, store.secrets.value.size)
    }

    @Test
    fun `loading pre-existing runs from storage does not add new ones on construction`() {
        val preExisting = listOf(
            RotationRun(secretId = "s1", secretName = "S1", status = "completed")
        )
        val fake = FakeSecretStorage(initialRuns = preExisting)

        val store = SecretStore(fake)

        assertEquals(1, store.runs.value.size)
        assertEquals(preExisting, store.runs.value)
    }
}
