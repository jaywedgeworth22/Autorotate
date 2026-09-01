package codes.autorotate.data

import android.app.KeyguardManager
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import codes.autorotate.model.SecretRecord
import codes.autorotate.model.RotationRun
import java.util.concurrent.ConcurrentHashMap

/**
 * Storage surface [SecretStore] depends on. Exists so tests can substitute an
 * in-memory fake instead of the real Android-Keystore-backed
 * [EncryptedStorage], which cannot run outside a device/emulator.
 */
interface SecretStorage {
    fun saveCredential(secretId: String, credential: String)
    fun getCredential(secretId: String): String?
    fun removeCredential(secretId: String)
    fun saveSecrets(secrets: List<SecretRecord>)
    fun getSecrets(): List<SecretRecord>
    fun saveRuns(runs: List<RotationRun>)
    fun getRuns(): List<RotationRun>
}

/**
 * A minimal key/value contract covering only what [EncryptedStorage] needs.
 * Lets us swap the backing store for an in-memory one if the real encrypted
 * prefs can't be opened, without exposing all of [SharedPreferences].
 */
private interface KVStore {
    fun getString(key: String, default: String? = null): String?
    fun putString(key: String, value: String)
    fun getBoolean(key: String, default: Boolean): Boolean
    fun putBoolean(key: String, value: Boolean)
    fun getLong(key: String, default: Long): Long
    fun putLong(key: String, value: Long)
    fun remove(key: String)
}

private class AndroidPrefsStore(val prefs: SharedPreferences) : KVStore {
    override fun getString(key: String, default: String?): String? = prefs.getString(key, default)
    override fun putString(key: String, value: String) { prefs.edit().putString(key, value).apply() }
    override fun getBoolean(key: String, default: Boolean): Boolean = prefs.getBoolean(key, default)
    override fun putBoolean(key: String, value: Boolean) { prefs.edit().putBoolean(key, value).apply() }
    override fun getLong(key: String, default: Long): Long = prefs.getLong(key, default)
    override fun putLong(key: String, value: Long) { prefs.edit().putLong(key, value).apply() }
    override fun remove(key: String) { prefs.edit().remove(key).apply() }
}

/**
 * Fallback used only when the encrypted prefs file could not be opened at
 * all (e.g. a corrupted Keystore entry). Nothing persists across process
 * death, but the app still opens to an empty inventory instead of crashing —
 * and nothing decrypts or leaks whatever was on disk before.
 */
private class InMemoryStore : KVStore {
    private val map = ConcurrentHashMap<String, Any>()
    override fun getString(key: String, default: String?): String? = map[key] as? String ?: default
    override fun putString(key: String, value: String) { map[key] = value }
    override fun getBoolean(key: String, default: Boolean): Boolean = map[key] as? Boolean ?: default
    override fun putBoolean(key: String, value: Boolean) { map[key] = value }
    override fun getLong(key: String, default: Long): Long = map[key] as? Long ?: default
    override fun putLong(key: String, value: Long) { map[key] = value }
    override fun remove(key: String) { map.remove(key) }
}

/**
 * AR-14: the Keystore key backing our encrypted prefs must be bound to user
 * authentication so stored credentials can't be decrypted just because the
 * process is running — a fingerprint/PIN check within the last
 * [AUTH_VALIDITY_SECONDS] seconds is required. On a device with no secure
 * lock screen there is nothing to bind to, so we fall back to an unbound key
 * (the app must still open); [isAuthBound] reports which mode is active.
 *
 * Changing a Keystore key's authentication requirement makes previously
 * written ciphertext unreadable, so this also versions the prefs file
 * ([PREFS_NAME_V2], a new name and a new key alias) and performs a best-effort
 * one-time migration from the old, unbound-key file. Migration failure never
 * crashes the app — it logs a warning (no secret material) and starts from an
 * empty inventory.
 */
class EncryptedStorage(context: Context) : SecretStorage {

    companion object {
        private const val TAG = "EncryptedStorage"
        private const val LEGACY_PREFS_NAME = "autorotate_secure_prefs"
        private const val PREFS_NAME_V2 = "autorotate_secure_prefs_v2"

        // A dedicated alias for the v2 key so it is always freshly generated
        // with today's auth requirement, rather than risking Keystore
        // returning a pre-existing (unbound) key stored under the legacy
        // default alias.
        private const val V2_KEY_ALIAS = "codes.autorotate.masterkey.v2"

        private const val AUTH_VALIDITY_SECONDS = 300
        private const val MIGRATION_DONE_KEY = "__migrated_from_legacy_prefs__"
    }

    /** True when the master key requires recent biometric/device-credential auth to use. */
    val isAuthBound: Boolean

    private val store: KVStore

    init {
        val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        val deviceIsSecure = keyguardManager?.isDeviceSecure == true
        isAuthBound = deviceIsSecure

        store = try {
            val androidStore = AndroidPrefsStore(openV2Prefs(context, requireAuth = deviceIsSecure))
            migrateLegacyIfNeeded(context, androidStore)
            androidStore
        } catch (e: Exception) {
            Log.w(TAG, "Could not open secure storage (${e.javaClass.simpleName}); " +
                "starting from an empty, non-persistent inventory. No secret material is logged.")
            InMemoryStore()
        }
    }

    private fun openV2Prefs(context: Context, requireAuth: Boolean): SharedPreferences {
        val keyBuilder = MasterKey.Builder(context, V2_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        if (requireAuth) {
            // Binds the Keystore key to BIOMETRIC_STRONG or DEVICE_CREDENTIAL
            // auth with a validity window, per the platform's own semantics
            // for setUserAuthenticationRequired(required, validitySeconds).
            keyBuilder.setUserAuthenticationRequired(true, AUTH_VALIDITY_SECONDS)
        }
        val masterKey = keyBuilder.build()
        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME_V2,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    /**
     * One-time best-effort copy of the legacy (unbound-key) prefs file into
     * the new v2 store, then deletes the legacy file. Safe to call every
     * launch: it is a no-op once [MIGRATION_DONE_KEY] is set or there is
     * nothing to migrate.
     */
    private fun migrateLegacyIfNeeded(context: Context, target: AndroidPrefsStore) {
        if (target.getBoolean(MIGRATION_DONE_KEY, false)) return

        val legacyFileHasData = try {
            context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE).all.isNotEmpty()
        } catch (e: Exception) {
            false
        }
        if (!legacyFileHasData) {
            target.putBoolean(MIGRATION_DONE_KEY, true)
            return
        }

        try {
            val legacyKey = MasterKey.Builder(context, MasterKey.DEFAULT_MASTER_KEY_ALIAS)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            val legacyPrefs = EncryptedSharedPreferences.create(
                context,
                LEGACY_PREFS_NAME,
                legacyKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            for ((key, value) in legacyPrefs.all) {
                // "runs_list" on any pre-fix install can only contain
                // fabricated rotation records (AR-05: rotateSecret /
                // rotateAllDue were the only writers of run history, and
                // both are deleted). Carrying that forward would resurrect
                // exactly the dishonest audit trail this fix removes.
                if (key == MIGRATION_DONE_KEY || key == "runs_list") continue
                when (value) {
                    is String -> target.putString(key, value)
                    is Boolean -> target.putBoolean(key, value)
                    is Long -> target.putLong(key, value)
                    // Int/Float/StringSet are not part of this app's schema;
                    // skip anything unexpected rather than guess.
                }
            }
            context.deleteSharedPreferences(LEGACY_PREFS_NAME)
        } catch (e: Exception) {
            Log.w(TAG, "Legacy secure-storage migration failed (${e.javaClass.simpleName}); " +
                "continuing with an empty inventory. No secret material is logged.")
        } finally {
            // Marked done either way: a failed migration should not be
            // retried forever, and a successful one should not repeat.
            target.putBoolean(MIGRATION_DONE_KEY, true)
        }
    }

    override fun saveCredential(secretId: String, credential: String) {
        store.putString("cred_$secretId", credential)
    }

    override fun getCredential(secretId: String): String? = store.getString("cred_$secretId")

    override fun removeCredential(secretId: String) {
        store.remove("cred_$secretId")
    }

    var biometricsEnabled: Boolean
        get() = store.getBoolean("biometrics_enabled", false)
        set(value) = store.putBoolean("biometrics_enabled", value)

    var infisicalWorkspaceId: String
        get() = store.getString("infisical_workspace", "") ?: ""
        set(value) = store.putString("infisical_workspace", value)

    var infisicalEnvironment: String
        get() = store.getString("infisical_env", "prod") ?: "prod"
        set(value) = store.putString("infisical_env", value)

    var infisicalClientId: String
        get() = store.getString("infisical_client_id", "") ?: ""
        set(value) = store.putString("infisical_client_id", value)

    var lastRefreshTimestamp: Long
        get() = store.getLong("last_refresh", 0L)
        set(value) = store.putLong("last_refresh", value)

    /** Pairing endpoint from the last successfully parsed QR payload (AR-20). */
    var pairingBaseUrl: String
        get() = store.getString("pairing_base_url", "") ?: ""
        set(value) = store.putString("pairing_base_url", value)

    var pairingEnvironment: String
        get() = store.getString("pairing_environment", "") ?: ""
        set(value) = store.putString("pairing_environment", value)

    private val gson = Gson()

    override fun saveSecrets(secrets: List<SecretRecord>) {
        store.putString("secrets_list", gson.toJson(secrets))
    }

    override fun getSecrets(): List<SecretRecord> {
        val json = store.getString("secrets_list") ?: return defaultSecrets()
        val type = object : TypeToken<List<SecretRecord>>() {}.type
        return try {
            gson.fromJson(json, type) ?: defaultSecrets()
        } catch (e: Exception) {
            defaultSecrets()
        }
    }

    override fun saveRuns(runs: List<RotationRun>) {
        store.putString("runs_list", gson.toJson(runs))
    }

    override fun getRuns(): List<RotationRun> {
        val json = store.getString("runs_list") ?: return emptyList()
        val type = object : TypeToken<List<RotationRun>>() {}.type
        return try {
            gson.fromJson(json, type) ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun defaultSecrets(): List<SecretRecord> = listOf(
        SecretRecord(
            name = "AWS_SECRET_ACCESS_KEY",
            connectorId = "aws-iam",
            fingerprint = "3f8a91b2"
        ),
        SecretRecord(
            name = "STRIPE_SECRET_KEY",
            connectorId = "stripe",
            fingerprint = "7a1c9e40"
        ),
        SecretRecord(
            name = "GITHUB_TOKEN",
            connectorId = "github",
            fingerprint = "c4d29a88"
        )
    )
}
