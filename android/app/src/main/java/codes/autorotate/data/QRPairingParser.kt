package codes.autorotate.data

import codes.autorotate.model.QRPairingPayload
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException

/**
 * Parses the JSON payload encoded in the web console's pairing QR code
 * (AR-20). Deliberately tolerant:
 *  - Unknown/extra JSON fields are ignored (Gson's default behaviour).
 *  - A missing or blank `baseUrl` — the one field this app actually needs,
 *    since the server has no `pairingToken` and `baseUrl` is the pairing
 *    endpoint — is reported as a [ParseResult.Failure] rather than thrown.
 *  - Malformed JSON never throws out of [parse]; it is converted to
 *    [ParseResult.Failure].
 *
 * No network dependency: this only decides whether a scanned/pasted payload
 * is well-formed enough to store. Kept in a plain, no-Android-framework
 * class so it can run under a JVM unit test without Robolectric.
 */
object QRPairingParser {
    private val gson = Gson()

    sealed class ParseResult {
        data class Success(val payload: QRPairingPayload) : ParseResult()
        data class Failure(val reason: String) : ParseResult()
    }

    fun parse(json: String): ParseResult {
        if (json.isBlank()) {
            return ParseResult.Failure("Pairing payload is empty.")
        }
        val payload = try {
            gson.fromJson(json, QRPairingPayload::class.java)
        } catch (e: JsonSyntaxException) {
            return ParseResult.Failure("Pairing payload is not valid JSON.")
        } catch (e: Exception) {
            return ParseResult.Failure("Could not read pairing payload: ${e.javaClass.simpleName}.")
        }

        if (payload == null) {
            return ParseResult.Failure("Pairing payload is empty.")
        }
        if (payload.baseUrl.isNullOrBlank()) {
            return ParseResult.Failure("Pairing payload is missing the required \"baseUrl\" field.")
        }
        return ParseResult.Success(payload)
    }
}
