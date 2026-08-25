//
//  Fingerprint.swift
//  AutorotateCore
//
//  SHA-256 fingerprint helpers. Fingerprints are the ONLY trace of a secret
//  value that Autorotate is allowed to persist (architecture.md §6):
//  `fingerprint = sha256(value) hex [0:8]`.
//

import Foundation

/// Namespace for secret-value fingerprinting.
public enum Fingerprint {

    /// Number of leading hex characters of the SHA-256 digest that are kept
    /// as the persisted fingerprint.
    public static let prefixLength = 8

    /// Full lowercase hex SHA-256 digest of `value`.
    public static func sha256Hex(of value: String) -> String {
        AutorotateSHA256.hashHex(Data(value.utf8))
    }

    /// The persistable fingerprint of a secret value: the first
    /// ``prefixLength`` hex characters of its SHA-256 digest.
    ///
    /// - Parameter value: The plaintext secret value. Used in memory only;
    ///   the returned string is safe to persist.
    public static func of(_ value: String) -> String {
        String(sha256Hex(of: value).prefix(prefixLength))
    }
}

// MARK: - Secure random value generation

/// Generates new secret values for connectors whose platform expects the
/// client to supply the material (Infisical-as-source, Cloudflare token
/// value roll, generic REST).
public enum SecretGenerator {

    /// Alphabet used for generated secrets: unambiguous, URL-safe,
    /// shell-safe (no quotes/spaces).
    private static let alphabet = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")

    /// Generates a cryptographically random secret string.
    ///
    /// - Parameters:
    ///   - length: Number of characters. Defaults to 40 (≥ 256 bits of
    ///     entropy given the 64-symbol alphabet).
    ///   - prefix: Optional static prefix (e.g. `ts_`) so the value is
    ///     recognizable in target files.
    public static func randomValue(length: Int = 40, prefix: String = "") -> String {
        // SystemRandomNumberGenerator is backed by the OS CSPRNG
        // (arc4random_buf on Darwin), which is appropriate for secret
        // material. Rejection sampling avoids modulo bias.
        var generator = SystemRandomNumberGenerator()
        let count = max(1, length)
        let bound = UInt8.max - (UInt8.max % UInt8(alphabet.count))
        var result = prefix
        result.reserveCapacity(prefix.count + count)
        while result.count < prefix.count + count {
            let byte = UInt8.random(in: .min ... .max, using: &generator)
            guard byte < bound else { continue }
            result.append(alphabet[Int(byte) % alphabet.count])
        }
        return result
    }
}
