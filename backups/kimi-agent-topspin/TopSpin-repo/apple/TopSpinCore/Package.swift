// swift-tools-version: 5.9
//
// TopSpinCore — shared rotation-engine core for the TopSpin iOS and macOS apps.
//
// This package has **no third-party dependencies**. It relies only on:
//   - Foundation (networking, JSON, files)
//   - CryptoKit  (SHA-256 fingerprints, HMAC for AWS SigV4)
//   - Security   (Keychain Services; Apple platforms only)
//
// The iOS / macOS app targets consume this package and back the storage
// protocols (`SecretStore`, `AuditStore`, `RotationRunStore`) with SwiftData
// or UserDefaults — TopSpinCore intentionally takes no persistence dependency.

import PackageDescription

let package = Package(
    name: "TopSpinCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "TopSpinCore",
            targets: ["TopSpinCore"]
        )
    ],
    targets: [
        .target(
            name: "TopSpinCore",
            path: "Sources/TopSpinCore"
        ),
        .testTarget(
            name: "TopSpinCoreTests",
            dependencies: ["TopSpinCore"],
            path: "Tests/TopSpinCoreTests"
        )
    ]
)
