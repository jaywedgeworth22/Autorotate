import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Release signing is loaded from android/keystore.properties, which is never committed
// (see .gitignore). When that file is absent — e.g. on CI or a fresh checkout — the
// release build type is left WITHOUT a signingConfig. It must never fall back to the
// debug keystore: a debug-signed release APK can be forged into a trusted update by
// anyone, since the debug key ships with every Android SDK install (see AR-13/AR-33).
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
val hasReleaseSigning = keystorePropertiesFile.exists()

android {
    namespace = "codes.autorotate"
    compileSdk = 35

    defaultConfig {
        applicationId = "codes.autorotate"
        minSdk = 26
        targetSdk = 35
        // The release workflow (.github/workflows/release.yml) derives these from the
        // pushed git tag (v1.2.3 -> versionName "1.2.3", versionCode major*10000 +
        // minor*100 + patch) and passes them as env vars. A local/debug build with
        // neither set keeps the previous hardcoded defaults.
        versionCode = (System.getenv("ANDROID_VERSION_CODE")?.toIntOrNull()) ?: 1
        versionName = System.getenv("ANDROID_VERSION_NAME") ?: "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Compile-time DSN only.  Empty when SENTRY_DSN is unset so the SDK stays dark in CI.
        val sentryDsn = (System.getenv("SENTRY_DSN") ?: "")
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
        buildConfigField("String", "SENTRY_DSN", "\"$sentryDsn\"")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                // Resolve relative to the root project (android/), not this :app
                // subproject — the release workflow decodes upload-keystore.jks into
                // android/, matching keystorePropertiesFile above. Plain file() here
                // would look in android/app/ instead and fail to find it the first
                // time the signing secrets are actually configured.
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            // No signingConfig assigned when keystore.properties is absent: the release
            // artifact is then unsigned, not debug-signed. Deliberate — see comment above.
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.zxing.core)
    implementation(libs.okhttp)
    implementation(libs.gson)
    // Crash + ANR only.  Mapping upload plugin skipped; consumer rules ship with the AAR.
    implementation("io.sentry:sentry-android:8.54.0")

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    debugImplementation(libs.androidx.compose.ui.tooling)
}
