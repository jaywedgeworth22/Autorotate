package codes.autorotate.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
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
import codes.autorotate.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    storage: EncryptedStorage,
    onNavigateBack: () -> Unit
) {
    var biometricsEnabled by remember { mutableStateOf(storage.biometricsEnabled) }
    var workspaceId by remember { mutableStateOf(storage.infisicalWorkspaceId) }
    var environment by remember { mutableStateOf(storage.infisicalEnvironment) }
    var clientId by remember { mutableStateOf(storage.infisicalClientId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.Bold, color = TextPrimary) },
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
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Security Card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Panel)
                    .border(1.dp, LineSubtle, RoundedCornerShape(12.dp))
                    .padding(16.dp)
            ) {
                Text("SECURITY", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = TextMuted)
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Require Biometrics (Fingerprint / Face)", fontSize = 14.sp, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                        Text("Gated by Android BiometricPrompt & Keystore", fontSize = 11.sp, color = TextSecondary)
                    }
                    Switch(
                        checked = biometricsEnabled,
                        onCheckedChange = {
                            biometricsEnabled = it
                            storage.biometricsEnabled = it
                        },
                        colors = SwitchDefaults.colors(checkedThumbColor = SpinAccent, checkedTrackColor = SpinDark)
                    )
                }
            }

            // Infisical Integration
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Panel)
                    .border(1.dp, LineSubtle, RoundedCornerShape(12.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("INFISICAL WORKSPACE TARGET", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = TextMuted)
                OutlinedTextField(
                    value = workspaceId,
                    onValueChange = {
                        workspaceId = it
                        storage.infisicalWorkspaceId = it
                    },
                    label = { Text("Workspace ID", color = TextMuted) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = SpinAccent, unfocusedBorderColor = LineSubtle)
                )
                OutlinedTextField(
                    value = environment,
                    onValueChange = {
                        environment = it
                        storage.infisicalEnvironment = it
                    },
                    label = { Text("Environment (e.g. prod)", color = TextMuted) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = SpinAccent, unfocusedBorderColor = LineSubtle)
                )
                OutlinedTextField(
                    value = clientId,
                    onValueChange = {
                        clientId = it
                        storage.infisicalClientId = it
                    },
                    label = { Text("Client ID (Universal Auth)", color = TextMuted) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = SpinAccent, unfocusedBorderColor = LineSubtle)
                )
            }

            // About section
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Panel)
                    .border(1.dp, LineSubtle, RoundedCornerShape(12.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text("ABOUT", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = TextMuted)
                Text("Autorotate Mobile Companion (Android)", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                Text("Live Domain: Autorotate.codes", fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = SpinAccent)
                Text("Zero-Plaintext: Memory-only execution, Android Keystore encryption.", fontSize = 11.sp, color = TextSecondary)
            }
        }
    }
}
