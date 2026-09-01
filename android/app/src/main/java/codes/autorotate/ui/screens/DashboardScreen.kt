package codes.autorotate.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import codes.autorotate.data.SecretStore
import codes.autorotate.model.SecretRecord
import codes.autorotate.model.SecretStatus
import codes.autorotate.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    secretStore: SecretStore,
    onNavigateToImport: () -> Unit,
    onNavigateToScanner: () -> Unit,
    onNavigateToSettings: () -> Unit
) {
    val secrets by secretStore.secrets.collectAsState()

    val activeCount = secrets.count { it.status == SecretStatus.ACTIVE }
    val overdueCount = secrets.count { it.status == SecretStatus.OVERDUE || it.status == SecretStatus.FAILED }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Autorotate.Codes",
                            fontFamily = FontFamily.Default,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "MOBILE COMPANION",
                            fontFamily = FontFamily.Monospace,
                            fontSize = 10.sp,
                            color = SpinAccent,
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(SpinDark)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToScanner) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan Pairing QR", tint = SpinAccent)
                    }
                    IconButton(onClick = onNavigateToImport) {
                        Icon(Icons.Default.FileDownload, contentDescription = "Import .env", tint = TextPrimary)
                    }
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings", tint = TextSecondary)
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
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                // Header status card
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(Panel)
                        .border(1.dp, LineSubtle, RoundedCornerShape(16.dp))
                        .padding(18.dp)
                ) {
                    Text(
                        "INVENTORY",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = TextMuted
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Read-only viewer. Rotation runs from the web console, not this app.",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SpinAccent
                    )
                    Spacer(modifier = Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Active Secrets", fontSize = 12.sp, color = TextSecondary)
                            Text("$activeCount", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                        }
                        Column {
                            Text("Overdue / Due", fontSize = 12.sp, color = TextSecondary)
                            Text("$overdueCount", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = if (overdueCount > 0) StatusWarning else TextPrimary)
                        }
                        Column {
                            Text("Stored Plaintext", fontSize = 12.sp, color = TextSecondary)
                            Text("0", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = SpinAccent)
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Managed Credentials",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Text(
                        "${secrets.size} registered",
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace,
                        color = TextMuted
                    )
                }
            }

            items(secrets) { secret ->
                SecretItemCard(secret = secret)
            }

            item {
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }
}

@Composable
fun SecretItemCard(
    secret: SecretRecord
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Panel)
            .border(1.dp, LineSubtle, RoundedCornerShape(12.dp))
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    secret.name,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    "Connector: ${secret.connectorId} · sha256[0:8]: ${secret.fingerprint}",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    color = TextMuted
                )
            }
        }
    }
}
