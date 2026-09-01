package codes.autorotate.ui.components

import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

object BiometricPromptHelper {
    fun authenticate(
        activity: FragmentActivity,
        title: String = "Unlock Autorotate",
        subtitle: String = "Authenticate to access zero-plaintext credentials",
        onSuccess: () -> Unit,
        onError: (code: Int, message: String) -> Unit
    ) {
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    onError(errorCode, errString.toString())
                }
            }
        )

        // BIOMETRIC_STRONG or DEVICE_CREDENTIAL: a user with no enrolled
        // biometric, or whose biometric prompt fails, can still unlock with
        // their PIN/pattern/password (AR-14). The combined authenticator set
        // does not allow a separate negative/"Cancel" button — the OS
        // supplies its own way out of this combined prompt.
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)
            .build()

        prompt.authenticate(promptInfo)
    }
}
