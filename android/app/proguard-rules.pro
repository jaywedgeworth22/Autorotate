# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.kts.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Sentry ships consumer ProGuard rules in the AAR.  No extra -keep needed.

# AR31-26 (2026-09-20): R8 / minify is enabled in the release build
# (see build.gradle.kts `isMinifyEnabled = true`).  Without these rules
# Gson reflection on the SecretRecord / RotationRun models crashes at
# runtime with `JsonSyntaxException` once the release APK is loaded.
# Models are plain Kotlin data classes — we keep the whole package the
# storage layer reads through TypeToken so any new model added later is
# picked up automatically.

-keep class codes.autorotate.model.** { *; }
-keepclassmembers class codes.autorotate.model.** { *; }

# Gson uses reflection on generic TypeToken<>() parameters — keep the
# `Signature` attribute so the parameterized list types survive.
-keepattributes Signature
-keepattributes *Annotation*

# EncryptedStorage relies on the AndroidX Security Keystore-backed
# SharedPreferences file.  R8 can rename the keystore alias provider;
# the androidx.security library ships its own consumer rules, but the
# companion-app pairing code reads SharedPreferences directly so keep
# that class' public API.
-keep class codes.autorotate.data.EncryptedStorage { *; }
