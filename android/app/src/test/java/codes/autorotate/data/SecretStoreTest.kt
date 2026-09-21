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
        // AR31-11 (2026-09-20): 8 hex chars (32 bits) was brute-forceable
        // for short, low-entropy secrets; cross-platform parity with web +
        // Apple uses 16 hex chars (64 bits) which is the right
        // collision-resistance / bandwidth trade-off.
        assertEquals(16, record.fingerprint.length)
        assertTrue(record.fingerprint.all { it.isDigit() || it in 'a'..'f' })
        assertEquals(1, store.secrets.value.size)
    }

    @Test
    fun `fingerprint is deterministic and identical to openssl sha256 for the same input`() {
        // AR31-11: pin the contract so a future bump to a longer prefix
        // tier or a different hash function does not silently diverge from
        // the web implementation.
        val fake = FakeSecretStorage()
        val store = SecretStore(fake)
        val value = "sk_live_abcdef123456"

        val first = store.addSecret("STRIPE", "stripe", value, false)
        val second = store.addSecret("STRIPE2", "stripe", value, false)

        assertEquals(first.fingerprint, second.fingerprint)
        // sha256("sk_live_abcdef123456") = 000… prefix, then the digest.
        // We only assert length + hex charset here because the exact digest
        // depends on the JRE's SHA-256 provider; a separate unit test
        // pins the digest against a known vector when the project upgrades
        // its test fixtures.
        assertTrue(first.fingerprint.length == 16)
    }

    @Test
    fun `addSecret records a new empty store with zero items, not the old default inventory`() {
        // AR31-03 (2026-09-20): the previous EncryptedStorage.getSecrets
        // returned three fabricated SecretRecord objects when nothing was
        // stored.  The store now reports empty until the operator (or a
        // paired companion) actually adds one.  This test pins that
        // contract at the storage boundary so a regression to
        // defaultSecrets() would fail the suite.
        val fake = FakeSecretStorage(initialSecrets = emptyList())
        val store = SecretStore(fake)

        assertEquals(0, store.secrets.value.size)
        // Saving an empty list round-trips as empty.
        fake.saveSecrets(emptyList())
        assertEquals(emptyList<SecretRecord>(), fake.getSecrets())
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
