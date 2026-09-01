package codes.autorotate.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * AR-20: the server emits {version, appName, baseUrl, environment,
 * timestamp}. These tests pin the parser to that shape, plus the tolerance
 * this format needs in practice: a payload missing the one field we
 * actually use should fail cleanly, and unknown extra fields should never
 * break parsing.
 */
class QRPairingParserTest {

    @Test
    fun `valid payload parses successfully and exposes baseUrl as the pairing endpoint`() {
        val json = """
            {"version":1,"appName":"Autorotate","baseUrl":"https://example-workspace.example.com","environment":"production","timestamp":"2026-08-26T00:00:00.000Z"}
        """.trimIndent()

        val result = QRPairingParser.parse(json)

        assertTrue(result is QRPairingParser.ParseResult.Success)
        val payload = (result as QRPairingParser.ParseResult.Success).payload
        assertEquals("https://example-workspace.example.com", payload.baseUrl)
        assertEquals("https://example-workspace.example.com", payload.pairingEndpoint)
        assertEquals("production", payload.environment)
        assertEquals(1, payload.version)
        assertEquals("Autorotate", payload.appName)
    }

    @Test
    fun `payload missing baseUrl fails instead of pairing with nothing`() {
        val json = """{"version":1,"appName":"Autorotate","environment":"production"}"""

        val result = QRPairingParser.parse(json)

        assertTrue(result is QRPairingParser.ParseResult.Failure)
        val reason = (result as QRPairingParser.ParseResult.Failure).reason
        assertTrue(reason.contains("baseUrl"))
    }

    @Test
    fun `blank baseUrl is treated the same as a missing one`() {
        val json = """{"baseUrl":"   ","environment":"production"}"""

        val result = QRPairingParser.parse(json)

        assertTrue(result is QRPairingParser.ParseResult.Failure)
    }

    @Test
    fun `unknown extra fields are tolerated and ignored`() {
        val json = """
            {"version":1,"appName":"Autorotate","baseUrl":"https://example.autorotate.codes",
             "environment":"production","timestamp":"2026-08-26T00:00:00.000Z",
             "pairingToken":"unexpected-legacy-field","workspaceId":"also-unexpected"}
        """.trimIndent()

        val result = QRPairingParser.parse(json)

        assertTrue(result is QRPairingParser.ParseResult.Success)
        val payload = (result as QRPairingParser.ParseResult.Success).payload
        assertEquals("https://example.autorotate.codes", payload.baseUrl)
    }

    @Test
    fun `malformed JSON fails without throwing`() {
        val result = QRPairingParser.parse("{not valid json")

        assertTrue(result is QRPairingParser.ParseResult.Failure)
    }

    @Test
    fun `empty input fails without throwing`() {
        val result = QRPairingParser.parse("")

        assertTrue(result is QRPairingParser.ParseResult.Failure)
    }
}
