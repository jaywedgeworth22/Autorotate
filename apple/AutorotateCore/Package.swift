// swift-tools-version: 5.9
//
// AutorotateCore — shared rotation-engine core for the Autorotate iOS and macOS apps.
//
// This package has **no third-party dependencies**. It relies only on:
//   - Foundation (networking, JSON, files)
//   - CryptoKit  (SHA-256 fingerprints, HMAC for AWS SigV4)
//   - Security   (Keychain Services; Apple platforms only)
//
// The iOS / macOS app targets consume this package and back the storage
// protocols (`SecretStore`, `AuditStore`, `RotationRunStore`) with SwiftData
// or UserDefaults — AutorotateCore intentionally takes no persistence dependency.

import PackageDescription

let package = Package(
    name: "AutorotateCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "AutorotateCore",
            targets: ["AutorotateCore"]
        )
    ],
    targets: [
        .target(
            name: "AutorotateCore",
            path: "Sources/AutorotateCore"
        ),
        .testTarget(
            name: "AutorotateCoreTests",
            dependencies: ["AutorotateCore"],
            path: "Tests/AutorotateCoreTests"
        )
    ]
)
