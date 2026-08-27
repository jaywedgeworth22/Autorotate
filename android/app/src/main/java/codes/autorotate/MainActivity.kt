package codes.autorotate

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import codes.autorotate.data.EncryptedStorage
import codes.autorotate.data.SecretStore
import codes.autorotate.ui.components.BiometricPromptHelper
import codes.autorotate.ui.screens.*
import codes.autorotate.ui.theme.Abyss
import codes.autorotate.ui.theme.AutorotateTheme
import codes.autorotate.ui.theme.SpinAccent
import codes.autorotate.ui.theme.StatusError
import codes.autorotate.ui.theme.TextSecondary

class MainActivity : FragmentActivity() {
    private lateinit var storage: EncryptedStorage
    private lateinit var secretStore: SecretStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // AR-14: secret names, fingerprints and run history must never show
        // up in screenshots or the recents-list thumbnail.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        storage = (application as AutorotateApp).storage
        secretStore = SecretStore(this)

        setContent {
            AutorotateTheme {
                var isUnlocked by remember { mutableStateOf(!storage.biometricsEnabled) }
                var authError by remember { mutableStateOf<String?>(null) }

                fun startAuth() {
                    authError = null
                    BiometricPromptHelper.authenticate(
                        activity = this@MainActivity,
                        title = "Unlock Autorotate",
                        subtitle = "Zero-plaintext security check",
                        onSuccess = {
                            authError = null
                            isUnlocked = true
                        },
                        onError = { _, message -> authError = message }
                    )
                }

                LaunchedEffect(Unit) {
                    if (storage.biometricsEnabled) {
                        startAuth()
                    }
                }

                if (isUnlocked) {
                    val navController = rememberNavController()
                    NavHost(navController = navController, startDestination = "dashboard") {
                        composable("dashboard") {
                            DashboardScreen(
                                secretStore = secretStore,
                                onNavigateToImport = { navController.navigate("import") },
                                onNavigateToScanner = { navController.navigate("scanner") },
                                onNavigateToSettings = { navController.navigate("settings") }
                            )
                        }
                        composable("import") {
                            EnvImportScreen(
                                secretStore = secretStore,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }
                        composable("scanner") {
                            QRPairingScannerScreen(
                                storage = storage,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }
                        composable("settings") {
                            SettingsScreen(
                                storage = storage,
                                onNavigateBack = { navController.popBackStack() }
                            )
                        }
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Abyss),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            if (authError == null) {
                                CircularProgressIndicator(color = SpinAccent)
                                Spacer(modifier = Modifier.height(16.dp))
                                Text("Awaiting Biometric Authentication...")
                            } else {
                                Text(authError ?: "", color = StatusError)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    "Unlock is required to view stored secrets.",
                                    color = TextSecondary
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Button(
                                    onClick = { startAuth() },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = SpinAccent,
                                        contentColor = Abyss
                                    )
                                ) {
                                    Text("Retry")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
