package codes.autorotate.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import codes.autorotate.data.SecretStore
import codes.autorotate.ui.theme.*

data class ParsedEnvItem(
    val key: String,
    val value: String,
    val connectorId: String,
    val targetInfisical: Boolean = true
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EnvImportScreen(
    secretStore: SecretStore,
    onNavigateBack: () -> Unit
) {
    var rawText by remember { mutableStateOf("") }
    var parsedItems by remember { mutableStateOf<List<ParsedEnvItem>>(emptyList()) }
    var importSuccess by remember { mutableStateOf(false) }

    fun parseEnv(text: String) {
        val lines = text.lines()
        val items = mutableListOf<ParsedEnvItem>()
        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.isEmpty() || trimmed.startsWith("#")) continue
            val parts = trimmed.split("=", limit = 2)
            if (parts.size == 2) {
                val key = parts[0].trim().removePrefix("export ").trim()
                val value = parts[1].trim().removeSurrounding("\"", "\"").removeSurrounding("'", "'")
                val connector = detectConnector(key, value)
                items.add(ParsedEnvItem(key = key, value = value, connectorId = connector))
            }
        }
        parsedItems = items
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(".env & Key Importer", fontWeight = FontWeight.Bold, color = TextPrimary) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Abyss)
            )
        },
        containerColor = Abyss
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Text(
                    "Paste your .env or API keys file below. Plaintext is processed in-memory and immediately transferred into Encrypted Keystore storage with zero plaintext disk persistence.",
                    fontSize = 12.sp,
                    color = TextSecondary
                )
            }

            item {
                OutlinedTextField(
                    value = rawText,
                    onValueChange = {
                        rawText = it
                        parseEnv(it)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp),
                    placeholder = { Text("AWS_SECRET_ACCESS_KEY=...\nSTRIPE_SECRET_KEY=sk_live_...", color = TextMuted) },
                    textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = SpinAccent,
                        unfocusedBorderColor = LineSubtle,
                        focusedContainerColor = Panel,
                        unfocusedContainerColor = Panel
                    ),
                    shape = RoundedCornerShape(12.dp)
                )
            }

            if (parsedItems.isNotEmpty()) {
                item {
                    Text(
                        "Detected Secrets (${parsedItems.size})",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                }

                items(parsedItems) { item ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Panel)
                            .border(1.dp, LineSubtle, RoundedCornerShape(8.dp))
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(item.key, fontFamily = FontFamily.Monospace, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                            Text("Platform: ${item.connectorId}", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = SpinAccent)
                        }
                        Text("••••••••", fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = TextMuted)
                    }
                }

                item {
                    Button(
                        onClick = {
                            parsedItems.forEach {
                                secretStore.addSecret(
                                    name = it.key,
                                    connectorId = it.connectorId,
                                    value = it.value,
                                    targetInfisical = it.targetInfisical
                                )
                            }
                            importSuccess = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = SpinAccent, contentColor = SpinDark),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Register ${parsedItems.size} Secrets into Keystore", fontWeight = FontWeight.Bold)
                    }
                }
            }

            if (importSuccess) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(SpinDark)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = SpinAccent)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Successfully imported secrets with zero plaintext disk exposure.", color = SpinAccent, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

private fun detectConnector(key: String, value: String): String {
    val k = key.uppercase()
    return when {
        k.contains("AWS") -> "aws-iam"
        k.contains("STRIPE") -> "stripe"
        k.contains("GITHUB") || k.contains("GH_") -> "github"
        k.contains("OPENAI") -> "openai"
        k.contains("ANTHROPIC") -> "anthropic"
        k.contains("RESEND") -> "resend"
        k.contains("HUGGINGFACE") || k.contains("HF_") -> "huggingface"
        k.contains("NEON") -> "neon"
        k.contains("SLACK") -> "slack"
        k.contains("SENDGRID") -> "sendgrid"
        else -> "generic-api-key"
    }
}
