//
//  Fingerprint.swift
//  AutorotateCore
//
//  SHA-256 fingerprint helpers. Fingerprints are the ONLY trace of a secret
//  value that Autorotate is allowed to persist (architecture.md §6):
//  `fingerprint = sha256(value) hex [0:16]`.
//
//  LENGTH (16, unified 2026-08-26)
//  ------------------------------
//  Core kept 8 hex characters while the web engine kept 16 and
//  architecture.md §6 specified 8 — three different answers, so a
//  cross-platform drift comparison mismatched by construction. All three now
//  say 16 (64 bits of the digest), which is the web app's existing on-disk
//  format and therefore the one that needs no data migration.
//
//  Records written by an older Apple build still hold 8-character
//  fingerprints. ``Fingerprint/matches(_:_:)`` compares on the shorter of
//  the two lengths so those records do not all report drift the moment they
//  meet a freshly computed 16-character fingerprint.
//

import Foundation

/// Namespace for secret-value fingerprinting.
public enum Fingerprint {

    /// Number of leading hex characters of the SHA-256 digest that are kept
    /// as the persisted fingerprint. Must stay in step with the web engine's
    /// `fingerprint()` in `apps/web/api/autorotate/crypto.ts` and with
    /// `docs/architecture.md` §6.
    public static let prefixLength = 16

    /// Length written by Apple builds before the 2026-08-26 unification.
    /// Kept only so ``matches(_:_:)`` can recognise those records.
    public static let legacyPrefixLength = 8

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

    /// Whether two stored fingerprints describe the same secret value, for
    /// drift detection.
    ///
    /// Both are prefixes of the same digest, so comparison happens on the
    /// **shorter** of the two lengths: a legacy 8-character record meeting a
    /// current 16-character fingerprint compares on 8 and matches, instead of
    /// every pre-upgrade record reporting drift at once. Two fingerprints of
    /// equal length compare in full, so no precision is given up between
    /// current records.
    ///
    /// `nil` on either side means "unknown", which is not a match — an absent
    /// fingerprint is not evidence of agreement.
    public static func matches(_ lhs: String?, _ rhs: String?) -> Bool {
        guard let lhs, let rhs, !lhs.isEmpty, !rhs.isEmpty else { return false }
        let width = min(lhs.count, rhs.count)
        return lhs.prefix(width).lowercased() == rhs.prefix(width).lowercased()
    }

    /// Whether `stored` still describes `value`. Convenience wrapper over
    /// ``matches(_:_:)`` for the common "has this secret drifted?" check.
    public static func matches(stored: String?, value: String) -> Bool {
        matches(stored, of(value))
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
