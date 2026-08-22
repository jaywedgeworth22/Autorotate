package codes.autorotate

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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

class MainActivity : FragmentActivity() {
    private lateinit var storage: EncryptedStorage
    private lateinit var secretStore: SecretStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        storage = (application as AutorotateApp).storage
        secretStore = SecretStore(this)

        setContent {
            AutorotateTheme {
                var isUnlocked by remember { mutableStateOf(!storage.biometricsEnabled) }

                LaunchedEffect(Unit) {
                    if (storage.biometricsEnabled) {
                        BiometricPromptHelper.authenticate(
                            activity = this@MainActivity,
                            title = "Unlock Autorotate",
                            subtitle = "Zero-plaintext security check",
                            onSuccess = { isUnlocked = true },
                            onError = { /* fallback / retry */ }
                        )
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
                            CircularProgressIndicator(color = SpinAccent)
                            Spacer(modifier = Modifier.height(16.dp))
                            Text("Awaiting Biometric Authentication...")
                        }
                    }
                }
            }
        }
    }
}
