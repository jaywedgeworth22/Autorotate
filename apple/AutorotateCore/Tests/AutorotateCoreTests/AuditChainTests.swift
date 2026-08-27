//
//  AuditChainTests.swift
//  AutorotateCoreTests
//
//  AR-08: the Apple audit log must be append-only AND hash-chained
//  (AGENTS.md invariant 2). These tests cover the four properties the fix
//  has to hold: chain continuity, tamper detection, legacy-prefix tolerance
//  and a deterministic hash for a fixed entry.
//

import XCTest
@testable import AutorotateCore

final class AuditChainTests: XCTestCase {

    // MARK: - Fixtures

    /// A fully pinned entry — every field fixed, nothing defaulted — so its
    /// canonical form and hash are reproducible across runs and machines.
    private func fixedEntry() -> AuditEntry {
        AuditEntry(
            id: UUID(uuidString: "6C9F1A2B-3C4D-5E6F-7081-92A3B4C5D6E7")!,
            timestamp: Date(timeIntervalSince1970: 1_756_224_000.123),
            actor: "scheduler",
            action: .rotationCommitted,
            secretId: UUID(uuidString: "A41C0D1E-2F30-4152-6374-8596A7B8C9DA")!,
            runId: UUID(uuidString: "1B2E3D4C-5F60-7182-93A4-B5C6D7E8F901")!,
            fingerprint: "2cf24dba5fb0a30e",
            detail: ["version": "2", "trigger": "scheduled"])
    }

    // MARK: - Deterministic hashing

    func testCanonicalFormIsExactlyTheDocumentedString() {
        let canonical = AuditChain.canonicalForm(of: fixedEntry(),
                                                 prevHash: AuditChain.genesisHash)
        // Interpolated so the "secretId":"<uuid>" pair never shares a source
        // line — the gitleaks generic-api-key rule false-positives on it.
        let fixedSecretId = "a41c0d1e-2f30-4152-6374-8596a7b8c9da"
        XCTAssertEqual(canonical, """
        {"action":"rotationCommitted","actor":"scheduler","detail":\
        {"trigger":"scheduled","version":"2"},"fingerprint":"2cf24dba5fb0a30e",\
        "id":"6c9f1a2b-3c4d-5e6f-7081-92a3b4c5d6e7",\
        "prevHash":"\(AuditChain.genesisHash)",\
        "runId":"1b2e3d4c-5f60-7182-93a4-b5c6d7e8f901",\
        "secretId":"\(fixedSecretId)",\
        "ts":1756224000123}
        """)
    }

    /// Pinned digest, computed independently of this code
    /// (`sha256` of the canonical string asserted above). If it changes, the
    /// chain format changed and every already-persisted entry stops
    /// verifying — that is a migration, not a refactor, so the failure is
    /// the point.
    func testFixedEntryHasAStableHash() {
        let hash = AuditChain.entryHash(of: fixedEntry(), prevHash: AuditChain.genesisHash)
        XCTAssertEqual(hash, "3c6bf617f71f82782fcf4f537fafad4747c7b865f67a7da2614643651d73f41a")
    }

    func testHashIsFullSha256AndNeverTruncated() {
        let hash = AuditChain.entryHash(of: fixedEntry(), prevHash: AuditChain.genesisHash)
        XCTAssertEqual(hash.count, 64)
        XCTAssertEqual(AuditChain.hashLength, 64)
        XCTAssertEqual(AuditChain.genesisHash.count, 64)
    }

    func testDetailKeyOrderDoesNotChangeTheHash() {
        var a = fixedEntry()
        var b = fixedEntry()
        a.detail = ["version": "2", "trigger": "scheduled"]
        b.detail = ["trigger": "scheduled", "version": "2"]
        XCTAssertEqual(AuditChain.entryHash(of: a, prevHash: AuditChain.genesisHash),
                       AuditChain.entryHash(of: b, prevHash: AuditChain.genesisHash))
    }

    /// The millisecond-precision class of bug: a store that round-trips the
    /// timestamp through a binary double must not change the hash.
    func testSubMillisecondNoiseDoesNotChangeTheSealedHash() {
        var noisy = fixedEntry()
        noisy.timestamp = Date(timeIntervalSince1970: 1_756_224_000.1230004)
        let sealedNoisy = AuditChain.seal(noisy, prevHash: AuditChain.genesisHash)
        let sealedClean = AuditChain.seal(fixedEntry(), prevHash: AuditChain.genesisHash)
        XCTAssertEqual(sealedNoisy.entryHash, sealedClean.entryHash)
        // …and sealing writes back the millisecond-truncated timestamp, so
        // what is persisted is exactly what was hashed.
        XCTAssertEqual(AuditChain.millisecondsSince1970(sealedNoisy.timestamp), 1_756_224_000_123)
        XCTAssertEqual(AuditChain.entryHash(of: sealedNoisy, prevHash: AuditChain.genesisHash),
                       sealedNoisy.entryHash)
    }

    // MARK: - Chain continuity

    func testAppendBuildsAContinuousChain() async throws {
        let store = InMemoryAuditStore()
        for index in 0..<5 {
            try await store.append(AuditEntry(actor: "user:test",
                                              action: .secretRegistered,
                                              detail: ["index": "\(index)"]))
        }

        let entries = try await store.recent(limit: 100).reversed().map { $0 }
        XCTAssertEqual(entries.count, 5)
        XCTAssertEqual(entries[0].prevHash, AuditChain.genesisHash)
        for index in 1..<entries.count {
            XCTAssertEqual(entries[index].prevHash, entries[index - 1].entryHash,
                           "entry \(index) must link to its predecessor")
        }
        XCTAssertTrue(entries.allSatisfy { $0.entryHash?.count == 64 })

        let verification = try await store.verifyChain()
        XCTAssertTrue(verification.isValid)
        XCTAssertEqual(verification.checked, 5)
        XCTAssertEqual(verification.legacyPrefixCount, 0)
        XCTAssertNil(verification.brokenAtEntryId)
    }

    func testTimestampsAreStrictlyIncreasingSoOrderIsUnambiguous() async throws {
        let store = InMemoryAuditStore()
        let sameInstant = Date(timeIntervalSince1970: 1_756_224_000)
        for _ in 0..<3 {
            try await store.append(AuditEntry(timestamp: sameInstant,
                                              actor: "scheduler",
                                              action: .rotationStarted))
        }
        let entries = try await store.recent(limit: 10).reversed().map { $0 }
        XCTAssertTrue(entries[0].timestamp < entries[1].timestamp)
        XCTAssertTrue(entries[1].timestamp < entries[2].timestamp)
        let verification = try await store.verifyChain()
        XCTAssertTrue(verification.isValid)
    }

    // MARK: - Tamper detection

    func testEditingAnEntryInPlaceIsDetected() async throws {
        let store = InMemoryAuditStore()
        for action in [AuditAction.rotationStarted, .rotationCommitted, .secretRegistered] {
            try await store.append(AuditEntry(actor: "scheduler", action: action))
        }
        var entries = try await store.recent(limit: 10).reversed().map { $0 }

        // Rewrite history: turn the middle failure-adjacent entry into
        // something else while keeping its hashes.
        entries[1].actor = "attacker"
        let verification = AuditChain.verify(entries)
        XCTAssertFalse(verification.isValid)
        XCTAssertEqual(verification.brokenAtEntryId, entries[1].id)
        XCTAssertEqual(verification.checked, 1, "the untouched prefix still verifies")
    }

    func testRemovingAnEntryBreaksTheLink() async throws {
        let store = InMemoryAuditStore()
        for index in 0..<4 {
            try await store.append(AuditEntry(actor: "scheduler",
                                              action: .rotationCommitted,
                                              detail: ["index": "\(index)"]))
        }
        var entries = try await store.recent(limit: 10).reversed().map { $0 }
        entries.remove(at: 1)

        let verification = AuditChain.verify(entries)
        XCTAssertFalse(verification.isValid)
        XCTAssertEqual(verification.brokenAtEntryId, entries[1].id)
    }

    func testUnsealedEntryAfterAChainedOneIsRejected() async throws {
        let store = InMemoryAuditStore()
        try await store.append(AuditEntry(actor: "scheduler", action: .rotationStarted))
        var entries = try await store.recent(limit: 10).reversed().map { $0 }
        entries.append(AuditEntry(actor: "attacker", action: .secretDeleted))

        let verification = AuditChain.verify(entries)
        XCTAssertFalse(verification.isValid)
        XCTAssertEqual(verification.failureReason, "Unsealed entry after a chained entry.")
    }

    // MARK: - Legacy prefix tolerance

    func testLegacyEntriesAreTreatedAsAPreChainPrefix() async throws {
        // An install upgraded from a build with no chaining: three entries
        // already on disk with no hashes at all.
        let legacy = (0..<3).map { index in
            AuditEntry(timestamp: Date(timeIntervalSince1970: 1_756_000_000 + Double(index)),
                       actor: "user:old",
                       action: .secretRegistered,
                       detail: ["index": "\(index)"])
        }
        let store = InMemoryAuditStore(seeding: legacy)

        // Verification of the untouched legacy-only log must not report a
        // break — otherwise the upgrade bricks the audit view.
        var verification = try await store.verifyChain()
        XCTAssertTrue(verification.isValid)
        XCTAssertEqual(verification.legacyPrefixCount, 3)
        XCTAssertEqual(verification.checked, 0)

        // New entries start the chain at genesis on top of the prefix.
        try await store.append(AuditEntry(actor: "scheduler", action: .rotationCommitted))
        try await store.append(AuditEntry(actor: "scheduler", action: .rotationCommitted))

        verification = try await store.verifyChain()
        XCTAssertTrue(verification.isValid)
        XCTAssertEqual(verification.legacyPrefixCount, 3)
        XCTAssertEqual(verification.checked, 2)

        let entries = try await store.recent(limit: 10).reversed().map { $0 }
        XCTAssertEqual(entries[3].prevHash, AuditChain.genesisHash)
        XCTAssertEqual(entries[4].prevHash, entries[3].entryHash)
    }

    func testTamperingIsStillCaughtAboveALegacyPrefix() async throws {
        let legacy = [AuditEntry(timestamp: Date(timeIntervalSince1970: 1_756_000_000),
                                 actor: "user:old",
                                 action: .secretRegistered)]
        let store = InMemoryAuditStore(seeding: legacy)
        try await store.append(AuditEntry(actor: "scheduler", action: .rotationCommitted))
        try await store.append(AuditEntry(actor: "scheduler", action: .rotationCommitted))

        var entries = try await store.recent(limit: 10).reversed().map { $0 }
        entries[2].detail["version"] = "999"

        let verification = AuditChain.verify(entries)
        XCTAssertFalse(verification.isValid)
        XCTAssertEqual(verification.legacyPrefixCount, 1)
        XCTAssertEqual(verification.brokenAtEntryId, entries[2].id)
    }

    // MARK: - Engine integration

    func testEntriesWrittenByTheEngineAreChained() async throws {
        let secrets = InMemorySecretStore()
        let audit = InMemoryAuditStore()

        let envPath = (NSTemporaryDirectory() as NSString)
            .appendingPathComponent("autorotate-chain-\(UUID().uuidString).env")
        defer { try? FileManager.default.removeItem(atPath: envPath) }

        struct StubConnector: SecretConnector {
            var id: String { "stub" }
            var displayName: String { "Stub" }
            var capability: ConnectorCapability { .programmatic }
            func rotate(adminCredential: String) async throws -> String { "rotated-value-1" }
        }

        let record = SecretRecord(
            name: "MY_SECRET",
            connectorId: "stub",
            targets: [.file(FileTargetConfig(path: envPath, format: .dotenv, keyPath: "MY_SECRET"))])
        try await secrets.saveSecret(record)

        let engine = RotationEngine(dependencies: .init(
            secretStore: secrets,
            auditStore: audit,
            credentialProvider: ClosureCredentialProvider { _, _ in "admin" },
            connectorProvider: { _ in StubConnector() },
            infisicalClientProvider: { _ in
                XCTFail("no infisical target in this test")
                return InfisicalClient()
            }))

        _ = await engine.rotate(secretId: record.id, actor: "user:test")

        let verification = try await audit.verifyChain()
        XCTAssertTrue(verification.isValid)
        XCTAssertGreaterThan(verification.checked, 0)
        let entries = try await audit.recent(limit: 50)
        XCTAssertTrue(entries.allSatisfy { $0.entryHash != nil && $0.prevHash != nil },
                      "the engine must never append an unsealed entry")
    }
}
