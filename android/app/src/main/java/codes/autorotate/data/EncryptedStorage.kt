package codes.autorotate.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import codes.autorotate.model.SecretRecord
import codes.autorotate.model.RotationRun

class EncryptedStorage(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "autorotate_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val gson = Gson()

    fun saveCredential(secretId: String, credential: String) {
        prefs.edit().putString("cred_$secretId", credential).apply()
    }

    fun getCredential(secretId: String): String? {
        return prefs.getString("cred_$secretId", null)
    }

    fun removeCredential(secretId: String) {
        prefs.edit().remove("cred_$secretId").apply()
    }

    var biometricsEnabled: Boolean
        get() = prefs.getBoolean("biometrics_enabled", false)
        set(value) = prefs.edit().putBoolean("biometrics_enabled", value).apply()

    var infisicalWorkspaceId: String
        get() = prefs.getString("infisical_workspace", "") ?: ""
        set(value) = prefs.edit().putString("infisical_workspace", value).apply()

    var infisicalEnvironment: String
        get() = prefs.getString("infisical_env", "prod") ?: "prod"
        set(value) = prefs.edit().putString("infisical_env", value).apply()

    var infisicalClientId: String
        get() = prefs.getString("infisical_client_id", "") ?: ""
        set(value) = prefs.edit().putString("infisical_client_id", value).apply()

    var lastRefreshTimestamp: Long
        get() = prefs.getLong("last_refresh", 0L)
        set(value) = prefs.edit().putLong("last_refresh", value).apply()

    fun saveSecrets(secrets: List<SecretRecord>) {
        val json = gson.toJson(secrets)
        prefs.edit().putString("secrets_list", json).apply()
    }

    fun getSecrets(): List<SecretRecord> {
        val json = prefs.getString("secrets_list", null) ?: return defaultSecrets()
        val type = object : TypeToken<List<SecretRecord>>() {}.type
        return try {
            gson.fromJson(json, type) ?: defaultSecrets()
        } catch (e: Exception) {
            defaultSecrets()
        }
    }

    fun saveRuns(runs: List<RotationRun>) {
        val json = gson.toJson(runs)
        prefs.edit().putString("runs_list", json).apply()
    }

    fun getRuns(): List<RotationRun> {
        val json = prefs.getString("runs_list", null) ?: return emptyList()
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
