//
//  AuditChain.swift
//  AutorotateCore
//
//  Hash chaining for the append-only audit log (AGENTS.md invariant 2:
//  "Audit chain stays append-only AND hash-chained").
//
//  Before this file the Apple audit log was append-only by convention only —
//  a doc comment on `AuditStore` — while the web app chained its entries.
//  Both platforms now chain identically, so an entry that is edited or
//  removed in place is detectable.
//
//  ── CANONICAL SERIALIZATION (normative) ────────────────────────────────
//
//  `entryHash` = lowercase hex SHA-256 (full 64 characters, never
//  truncated) of the UTF-8 bytes of the canonical form below.  The canonical
//  form is one JSON object written by hand — NOT by `JSONEncoder`, whose key
//  order and escaping are not contractual — with these rules:
//
//    * Field order is fixed and alphabetical:
//        action, actor, detail, fingerprint, id, prevHash, runId,
//        secretId, ts
//    * No whitespace anywhere.
//    * `id`, `secretId`, `runId` are lowercased UUID strings, or `null`.
//    * `fingerprint` is a JSON string, or `null`.
//    * `detail` is a JSON object whose keys are sorted by their **UTF-8
//      byte sequence** (not by locale, not by Unicode collation), so the
//      order is identical on every platform and OS version.
//    * `prevHash` is the previous entry's `entryHash`, or ``genesisHash``
//      for the first chained entry.
//    * `ts` is an **integer number of milliseconds since 1970-01-01 UTC** —
//      never a formatted date string and never a floating-point seconds
//      value.  `Date` round-trips through SwiftData / `JSONEncoder` as a
//      binary double, so hashing the raw `Double` (or an ISO-8601 string
//      rendered from it) makes the hash depend on sub-millisecond noise that
//      the store may not preserve.  ``seal(_:prevHash:)`` therefore also
//      *truncates the entry's own timestamp to whole milliseconds* before
//      hashing, so the value that is persisted is exactly the value that was
//      hashed.
//    * Strings are escaped with `"`, `\`, `\n`, `\r`, `\t` and `\u00XX` for
//      the remaining C0 controls.  Every other scalar is emitted literally
//      as UTF-8 (no `\uXXXX` escaping of non-ASCII), which is deterministic.
//
//  Example canonical form (line-wrapped here for readability only — the real
//  string contains no newlines):
//
//    {"action":"rotationCommitted","actor":"scheduler","detail":{"trigger":
//    "scheduled","version":"2"},"fingerprint":"2cf24dba5fb0a30e","id":
//    "6c9f…","prevHash":"0000…","runId":"1b2e…","secretId":"a41c…",
//    "ts":1756224000123}
//
//  ── LEGACY ENTRIES ─────────────────────────────────────────────────────
//
//  Entries written before this change have `prevHash == nil` and
//  `entryHash == nil`.  They are treated as a **pre-chain prefix**:
//  verification skips them, reports how many it skipped, and begins at the
//  first chained entry.  Existing installs therefore keep working and do not
//  report a broken chain — but nothing appended from now on can be altered
//  undetected.
//

import Foundation

// MARK: - Verification result

/// Outcome of verifying a window of the audit hash chain.
public struct AuditChainVerification: Sendable, Equatable {
    /// Whether every chained entry in the window links and hashes correctly.
    public var isValid: Bool
    /// How many chained entries were verified.
    public var checked: Int
    /// How many leading legacy (pre-chain) entries were skipped.
    public var legacyPrefixCount: Int
    /// Identifier of the first entry that failed, when `isValid == false`.
    public var brokenAtEntryId: UUID?
    /// Short, non-secret explanation of the failure.
    public var failureReason: String?

    public init(isValid: Bool,
                checked: Int,
                legacyPrefixCount: Int = 0,
                brokenAtEntryId: UUID? = nil,
                failureReason: String? = nil) {
        self.isValid = isValid
        self.checked = checked
        self.legacyPrefixCount = legacyPrefixCount
        self.brokenAtEntryId = brokenAtEntryId
        self.failureReason = failureReason
    }
}

// MARK: - AuditChain

/// Canonical serialization, sealing and verification for the audit hash
/// chain.  See the file header for the normative canonical form.
public enum AuditChain {

    /// `prevHash` of the first chained entry: 64 zero characters.
    public static let genesisHash = String(repeating: "0", count: 64)

    /// Length of a chain hash in hex characters. Full SHA-256, never
    /// truncated — a truncated chain hash is a weaker tamper barrier and the
    /// audit called it out explicitly.
    public static let hashLength = 64

    // MARK: Canonical form

    /// Milliseconds since 1970-01-01 UTC, rounded to the nearest whole
    /// millisecond. This is the only timestamp encoding the chain uses.
    public static func millisecondsSince1970(_ date: Date) -> Int64 {
        Int64((date.timeIntervalSince1970 * 1000).rounded())
    }

    /// The date that ``millisecondsSince1970(_:)`` round-trips to. Sealing
    /// normalizes `timestamp` through this so the persisted value and the
    /// hashed value can never disagree.
    public static func normalizedTimestamp(_ date: Date) -> Date {
        Date(timeIntervalSince1970: Double(millisecondsSince1970(date)) / 1000)
    }

    /// The canonical string that ``entryHash(of:prevHash:)`` digests.
    /// Exposed so tests (and a future cross-platform conformance test) can
    /// assert the exact bytes.
    public static func canonicalForm(of entry: AuditEntry, prevHash: String) -> String {
        var out = "{"
        out += "\"action\":" + jsonString(entry.action.rawValue)
        out += ",\"actor\":" + jsonString(entry.actor)
        out += ",\"detail\":" + canonicalDetail(entry.detail)
        out += ",\"fingerprint\":" + jsonOptionalString(entry.fingerprint)
        out += ",\"id\":" + jsonString(entry.id.uuidString.lowercased())
        out += ",\"prevHash\":" + jsonString(prevHash)
        out += ",\"runId\":" + jsonOptionalString(entry.runId?.uuidString.lowercased())
        out += ",\"secretId\":" + jsonOptionalString(entry.secretId?.uuidString.lowercased())
        out += ",\"ts\":\(millisecondsSince1970(entry.timestamp))"
        out += "}"
        return out
    }

    /// Full 64-character lowercase hex SHA-256 of the canonical form.
    public static func entryHash(of entry: AuditEntry, prevHash: String) -> String {
        AutorotateSHA256.hashHex(Data(canonicalForm(of: entry, prevHash: prevHash).utf8))
    }

    // MARK: Sealing

    /// Returns `entry` with its timestamp normalized to whole milliseconds
    /// and `prevHash` / `entryHash` populated.
    ///
    /// Any `prevHash` / `entryHash` already present on `entry` is
    /// overwritten: only the store that owns the chain decides where an
    /// entry links.
    public static func seal(_ entry: AuditEntry, prevHash: String) -> AuditEntry {
        var sealed = entry
        sealed.timestamp = normalizedTimestamp(entry.timestamp)
        sealed.prevHash = prevHash
        sealed.entryHash = entryHash(of: sealed, prevHash: prevHash)
        return sealed
    }

    /// Seals `entry` onto the chain whose newest entry is `tip`.
    ///
    /// This is the overload stores should use. Besides deriving `prevHash`
    /// it keeps timestamps **strictly increasing**: stores read the log back
    /// ordered by timestamp, so two entries sharing a millisecond would have
    /// an ambiguous order and could verify as broken through no fault of
    /// their own. When `tip` is `nil` (an empty log) or carries no
    /// `entryHash` (the log's newest entry is a legacy pre-chain entry), the
    /// new entry starts a fresh chain at ``genesisHash`` — which is exactly
    /// the pre-chain-prefix case ``verify(_:)`` tolerates.
    public static func seal(_ entry: AuditEntry, after tip: AuditEntry?) -> AuditEntry {
        var candidate = entry
        if let tip {
            let tipMs = millisecondsSince1970(tip.timestamp)
            if millisecondsSince1970(candidate.timestamp) <= tipMs {
                candidate.timestamp = Date(timeIntervalSince1970: Double(tipMs + 1) / 1000)
            }
        }
        return seal(candidate, prevHash: tip?.entryHash ?? genesisHash)
    }

    // MARK: Verification

    /// Verifies a window of the chain, **oldest entry first**.
    ///
    /// Legacy entries (no `entryHash`) at the head of the window are counted
    /// and skipped. The first chained entry in the window is the anchor: its
    /// `prevHash` is not checked against anything, because a window is
    /// usually a suffix of the log and the entry it links to may sit outside
    /// it. Its own fields are still covered, because `entryHash` digests
    /// `prevHash` together with the entry.
    ///
    /// A legacy entry appearing *after* a chained one is a failure: it means
    /// something was appended without being sealed, or the chained prefix
    /// was rewritten.
    public static func verify(_ entriesOldestFirst: [AuditEntry]) -> AuditChainVerification {
        var legacyPrefix = 0
        var index = 0
        while index < entriesOldestFirst.count, entriesOldestFirst[index].entryHash == nil {
            legacyPrefix += 1
            index += 1
        }

        var checked = 0
        var expectedPrev: String?
        while index < entriesOldestFirst.count {
            let entry = entriesOldestFirst[index]
            guard let hash = entry.entryHash, let prev = entry.prevHash else {
                return AuditChainVerification(
                    isValid: false,
                    checked: checked,
                    legacyPrefixCount: legacyPrefix,
                    brokenAtEntryId: entry.id,
                    failureReason: "Unsealed entry after a chained entry.")
            }
            if let expectedPrev, prev != expectedPrev {
                return AuditChainVerification(
                    isValid: false,
                    checked: checked,
                    legacyPrefixCount: legacyPrefix,
                    brokenAtEntryId: entry.id,
                    failureReason: "Broken link: prevHash does not match the previous entryHash.")
            }
            if entryHash(of: entry, prevHash: prev) != hash {
                return AuditChainVerification(
                    isValid: false,
                    checked: checked,
                    legacyPrefixCount: legacyPrefix,
                    brokenAtEntryId: entry.id,
                    failureReason: "Entry hash does not match its contents (entry altered).")
            }
            expectedPrev = hash
            checked += 1
            index += 1
        }

        return AuditChainVerification(isValid: true,
                                      checked: checked,
                                      legacyPrefixCount: legacyPrefix)
    }

    // MARK: - Deterministic JSON helpers
    //
    // Written by hand rather than delegating to JSONEncoder: the canonical
    // form is a wire contract shared with the web engine, and JSONEncoder
    // guarantees neither key order nor a specific escaping strategy.

    private static func canonicalDetail(_ detail: [String: String]) -> String {
        guard !detail.isEmpty else { return "{}" }
        // Sort by raw UTF-8 bytes so the order does not depend on locale or
        // on the Unicode collation tables of the running OS.
        let keys = detail.keys.sorted {
            Array($0.utf8).lexicographicallyPrecedes(Array($1.utf8))
        }
        let pairs = keys.map { jsonString($0) + ":" + jsonString(detail[$0] ?? "") }
        return "{" + pairs.joined(separator: ",") + "}"
    }

    private static func jsonOptionalString(_ value: String?) -> String {
        guard let value else { return "null" }
        return jsonString(value)
    }

    private static func jsonString(_ value: String) -> String {
        var out = "\""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "\"":     out += "\\\""
            case "\\":     out += "\\\\"
            case "\n":     out += "\\n"
            case "\r":     out += "\\r"
            case "\t":     out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        return out + "\""
    }
}
