package codes.autorotate.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import codes.autorotate.data.EncryptedStorage
import codes.autorotate.data.QRPairingParser
import codes.autorotate.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QRPairingScannerScreen(
    storage: EncryptedStorage,
    onNavigateBack: () -> Unit
) {
    var pairingCode by remember { mutableStateOf("") }
    var pairedStatus by remember { mutableStateOf<String?>(null) }
    var pairingFailed by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pair with Web Console", fontWeight = FontWeight.Bold, color = TextPrimary) },
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Text(
                "Point your camera at the QR code displayed on the Autorotate.codes Web Control Center (Pairing Modal) to securely link workspaces.",
                fontSize = 13.sp,
                color = TextSecondary,
                modifier = Modifier.fillMaxWidth()
            )

            // Mock viewfinder box
            Box(
                modifier = Modifier
                    .size(240.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Panel)
                    .border(2.dp, SpinAccent, RoundedCornerShape(20.dp)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.QrCodeScanner,
                        contentDescription = "Scanner Viewfinder",
                        tint = SpinAccent,
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        "CAMERA VIEWFINDER",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        color = TextMuted
                    )
                }
            }

            // Camera scanning is not implemented yet — paste the QR code's JSON
            // payload here instead (the same text the camera would decode).
            OutlinedTextField(
                value = pairingCode,
                onValueChange = { pairingCode = it },
                label = { Text("Pairing QR Payload (JSON)", color = TextMuted) },
                modifier = Modifier.fillMaxWidth(),
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = SpinAccent,
                    unfocusedBorderColor = LineSubtle,
                    focusedContainerColor = Panel,
                    unfocusedContainerColor = Panel
                ),
                shape = RoundedCornerShape(12.dp)
            )

            Button(
                onClick = {
                    when (val result = QRPairingParser.parse(pairingCode)) {
                        is QRPairingParser.ParseResult.Success -> {
                            val payload = result.payload
                            storage.pairingBaseUrl = payload.baseUrl.orEmpty()
                            storage.pairingEnvironment = payload.environment.orEmpty()
                            pairingFailed = false
                            pairedStatus = "Paired with ${payload.baseUrl}" +
                                (payload.environment?.let { " ($it)" } ?: "")
                        }
                        is QRPairingParser.ParseResult.Failure -> {
                            pairingFailed = true
                            pairedStatus = result.reason
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = SpinAccent, contentColor = SpinDark),
                shape = RoundedCornerShape(10.dp)
            ) {
                Icon(Icons.Default.Shield, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Complete Pairing", fontWeight = FontWeight.Bold)
            }

            pairedStatus?.let {
                Text(
                    it,
                    color = if (pairingFailed) StatusError else SpinAccent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}
