//
//  KeychainManagerTests.swift
//  AutorotateCoreTests
//
//  AR-12: without `kSecUseDataProtectionKeychain`, macOS writes
//  generic-password items to the legacy file-based keychain, where the
//  shared access group, `kSecAttrAccessibleAfterFirstUnlock` and iCloud sync
//  do not behave as documented. These tests drive ``KeychainManager``
//  against an in-memory double of the Security framework — a real keychain
//  cannot be populated deterministically from `swift test`, and the
//  entitlements are not present there.
//

#if canImport(Security)
import XCTest
import Security
@testable import AutorotateCore

// MARK: - In-memory Security double

/// Models the property that matters: **two separate keychains**, selected by
/// `kSecUseDataProtectionKeychain`. Items in one are invisible to queries
/// against the other — exactly the macOS behaviour that made AR-12 a silent
/// storage bug rather than an error.
private final class FakeKeychain: @unchecked Sendable {

    struct Key: Hashable {
        var dataProtection: Bool
        var service: String
        var account: String
    }

    struct Item {
        var value: String
        var synchronizable: Bool
        var accessible: String?
        var accessGroup: String?
    }

    private let lock = NSLock()
    private var items: [Key: Item] = [:]

    /// Every query dictionary the manager handed to the Security framework,
    /// so tests can assert on flags rather than only on outcomes.
    private(set) var seenQueries: [[String: Any]] = []

    func seedLegacy(service: String, account: String, value: String, synchronizable: Bool = false) {
        lock.lock(); defer { lock.unlock() }
        items[Key(dataProtection: false, service: service, account: account)] =
            Item(value: value, synchronizable: synchronizable, accessible: nil, accessGroup: nil)
    }

    func item(dataProtection: Bool, service: String, account: String) -> Item? {
        lock.lock(); defer { lock.unlock() }
        return items[Key(dataProtection: dataProtection, service: service, account: account)]
    }

    var count: Int {
        lock.lock(); defer { lock.unlock() }
        return items.count
    }

    /// Fails every `SecItemAdd` into the data-protection keychain, to prove
    /// migration never destroys the legacy copy when the write fails.
    var failsDataProtectionWrites = false

    var backend: SecItemBackend {
        SecItemBackend(
            add: { [weak self] query, _ in self?.add(query) ?? errSecInternalError },
            copyMatching: { [weak self] query, result in
                self?.copyMatching(query, result) ?? errSecInternalError
            },
            update: { [weak self] query, attrs in self?.update(query, attrs) ?? errSecInternalError },
            delete: { [weak self] query in self?.delete(query) ?? errSecInternalError })
    }

    // MARK: SecItem* implementations

    private func key(from query: [String: Any]) -> Key {
        Key(dataProtection: (query[kSecUseDataProtectionKeychain as String] as? Bool) ?? false,
            service: (query[kSecAttrService as String] as? String) ?? "",
            account: (query[kSecAttrAccount as String] as? String) ?? "")
    }

    private func record(_ query: CFDictionary) -> [String: Any] {
        let dict = (query as NSDictionary) as? [String: Any] ?? [:]
        lock.lock()
        seenQueries.append(dict)
        lock.unlock()
        return dict
    }

    private func add(_ query: CFDictionary) -> OSStatus {
        let dict = record(query)
        let k = key(from: dict)
        if k.dataProtection && failsDataProtectionWrites { return errSecIO }
        lock.lock(); defer { lock.unlock() }
        guard items[k] == nil else { return errSecDuplicateItem }
        guard let data = dict[kSecValueData as String] as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return errSecParam
        }
        items[k] = Item(
            value: value,
            synchronizable: (dict[kSecAttrSynchronizable as String] as? Bool) ?? false,
            accessible: dict[kSecAttrAccessible as String] as? String,
            accessGroup: dict[kSecAttrAccessGroup as String] as? String)
        return errSecSuccess
    }

    private func copyMatching(_ query: CFDictionary,
                              _ result: UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus {
        let dict = record(query)
        lock.lock()
        let found = items[key(from: dict)]
        lock.unlock()
        guard let found else { return errSecItemNotFound }

        let wantsData = (dict[kSecReturnData as String] as? Bool) ?? false
        let wantsAttributes = (dict[kSecReturnAttributes as String] as? Bool) ?? false
        guard let result else { return errSecSuccess }

        if wantsAttributes {
            var attributes: [String: Any] = [
                kSecAttrService as String: dict[kSecAttrService as String] ?? "",
                kSecAttrAccount as String: dict[kSecAttrAccount as String] ?? "",
                kSecAttrSynchronizable as String: found.synchronizable
            ]
            if wantsData { attributes[kSecValueData as String] = Data(found.value.utf8) }
            result.pointee = attributes as CFDictionary
        } else if wantsData {
            result.pointee = Data(found.value.utf8) as CFTypeRef
        }
        return errSecSuccess
    }

    private func update(_ query: CFDictionary, _ attrs: CFDictionary) -> OSStatus {
        let dict = record(query)
        let updates = (attrs as NSDictionary) as? [String: Any] ?? [:]
        lock.lock(); defer { lock.unlock() }
        let k = key(from: dict)
        guard var existing = items[k] else { return errSecItemNotFound }
        if let data = updates[kSecValueData as String] as? Data,
           let value = String(data: data, encoding: .utf8) {
            existing.value = value
        }
        if let sync = updates[kSecAttrSynchronizable as String] as? Bool {
            existing.synchronizable = sync
        }
        items[k] = existing
        return errSecSuccess
    }

    private func delete(_ query: CFDictionary) -> OSStatus {
        let dict = record(query)
        lock.lock(); defer { lock.unlock() }
        return items.removeValue(forKey: key(from: dict)) == nil ? errSecItemNotFound : errSecSuccess
    }
}

// MARK: - Tests

final class KeychainManagerTests: XCTestCase {

    private let service = "codes.autorotate.test"
    private let account = "MY_SECRET"

    private func makeManager(_ fake: FakeKeychain,
                             migrates: Bool = true) -> KeychainManager {
        KeychainManager(accessGroup: KeychainManager.sharedAccessGroup,
                        defaultSynchronizable: false,
                        migratesLegacyItems: migrates,
                        secItem: fake.backend)
    }

    // MARK: Data-protection keychain flag

    func testSaveWritesToTheDataProtectionKeychain() throws {
        let fake = FakeKeychain()
        try makeManager(fake).save(value: "v1", account: account, service: service)

        XCTAssertEqual(fake.item(dataProtection: true, service: service, account: account)?.value, "v1")
        XCTAssertNil(fake.item(dataProtection: false, service: service, account: account),
                     "nothing may land in the legacy keychain")
    }

    func testEveryQuerySetsTheDataProtectionFlagExplicitly() throws {
        let fake = FakeKeychain()
        let manager = makeManager(fake)
        try manager.save(value: "v1", account: account, service: service)
        _ = try manager.read(account: account, service: service)
        try manager.update(value: "v2", account: account, service: service)
        _ = manager.exists(account: account, service: service)
        try manager.delete(account: account, service: service)

        XCTAssertFalse(fake.seenQueries.isEmpty)
        for query in fake.seenQueries {
            XCTAssertNotNil(query[kSecUseDataProtectionKeychain as String] as? Bool,
                            "a query without the flag silently targets the legacy macOS keychain")
        }
    }

    func testWriteSetsAccessibleAfterFirstUnlockAndTheSharedAccessGroup() throws {
        let fake = FakeKeychain()
        try makeManager(fake).save(value: "v1", account: account, service: service)

        let stored = fake.item(dataProtection: true, service: service, account: account)
        XCTAssertEqual(stored?.accessible, kSecAttrAccessibleAfterFirstUnlock as String)
        XCTAssertEqual(stored?.accessGroup, KeychainManager.sharedAccessGroup)
    }

    func testAccessibleIsNeverPartOfASearchQuery() throws {
        let fake = FakeKeychain()
        let manager = makeManager(fake)
        try manager.save(value: "v1", account: account, service: service)
        _ = try manager.read(account: account, service: service)

        let searches = fake.seenQueries.filter { $0[kSecReturnData as String] != nil }
        XCTAssertFalse(searches.isEmpty)
        for search in searches {
            XCTAssertNil(search[kSecAttrAccessible as String],
                         "kSecAttrAccessible is a write attribute; in a search it narrows the match")
        }
    }

    func testSearchesMatchSynchronizableAny() throws {
        let fake = FakeKeychain()
        let manager = makeManager(fake)
        try manager.save(value: "v1", account: account, service: service)
        _ = try manager.read(account: account, service: service)
        _ = manager.exists(account: account, service: service)
        try manager.delete(account: account, service: service)

        let reads = fake.seenQueries.filter {
            $0[kSecReturnData as String] != nil || $0[kSecValueData as String] == nil
        }
        let anyValue = kSecAttrSynchronizableAny as String
        let matching = reads.filter { ($0[kSecAttrSynchronizable as String] as? String) == anyValue }
        XCTAssertFalse(matching.isEmpty,
                       "reads/updates/deletes must see both local and iCloud copies")
    }

    func testICloudSyncFallsBackToALocalItem() throws {
        // A backend that refuses synchronizable adds, the way a device
        // without the sync entitlement does.
        let fake = FakeKeychain()
        let inner = fake.backend
        let backend = SecItemBackend(
            add: { query, result in
                let dict = (query as NSDictionary) as? [String: Any] ?? [:]
                if (dict[kSecAttrSynchronizable as String] as? Bool) == true {
                    return errSecMissingEntitlement
                }
                return inner.add(query, result)
            },
            copyMatching: inner.copyMatching,
            update: inner.update,
            delete: inner.delete)

        let manager = KeychainManager(accessGroup: nil,
                                      defaultSynchronizable: true,
                                      secItem: backend)
        try manager.save(value: "v1", account: account, service: service)

        let stored = fake.item(dataProtection: true, service: service, account: account)
        XCTAssertEqual(stored?.value, "v1")
        XCTAssertEqual(stored?.synchronizable, false, "must degrade to a local item, not throw")
    }

    // MARK: Legacy migration

    func testReadMigratesALegacyItemIntoTheDataProtectionKeychain() throws {
        let fake = FakeKeychain()
        fake.seedLegacy(service: service, account: account, value: "legacy-value")

        let value = try makeManager(fake).read(account: account, service: service)
        XCTAssertEqual(value, "legacy-value")
        XCTAssertEqual(fake.item(dataProtection: true, service: service, account: account)?.value,
                       "legacy-value")
        XCTAssertNil(fake.item(dataProtection: false, service: service, account: account),
                     "the legacy copy is removed once the new one is written")
        XCTAssertEqual(fake.count, 1)
    }

    func testMigrationPreservesTheSynchronizableAttribute() throws {
        let fake = FakeKeychain()
        fake.seedLegacy(service: service, account: account, value: "v", synchronizable: true)

        _ = try makeManager(fake).read(account: account, service: service)
        XCTAssertEqual(fake.item(dataProtection: true, service: service, account: account)?.synchronizable,
                       true)
    }

    func testMigrationNeverLosesTheItemWhenTheNewWriteFails() throws {
        let fake = FakeKeychain()
        fake.seedLegacy(service: service, account: account, value: "precious")
        fake.failsDataProtectionWrites = true

        // The caller still gets its value…
        XCTAssertEqual(try makeManager(fake).read(account: account, service: service), "precious")
        // …and the legacy item is exactly where it was, so the next read
        // finds it again.
        XCTAssertEqual(fake.item(dataProtection: false, service: service, account: account)?.value,
                       "precious")
        XCTAssertNil(fake.item(dataProtection: true, service: service, account: account))
    }

    func testUpdateOfALegacyOnlyItemMigratesItWithTheNewValue() throws {
        let fake = FakeKeychain()
        fake.seedLegacy(service: service, account: account, value: "old")

        try makeManager(fake).update(value: "new", account: account, service: service)
        XCTAssertEqual(fake.item(dataProtection: true, service: service, account: account)?.value, "new")
        XCTAssertNil(fake.item(dataProtection: false, service: service, account: account))
    }

    func testSaveOverALegacyItemDropsTheStaleLegacyCopy() throws {
        let fake = FakeKeychain()
        fake.seedLegacy(service: service, account: account, value: "stale")

        try makeManager(fake).save(value: "fresh", account: account, service: service)
        XCTAssertEqual(fake.item(dataProtection: true, service: service, account: account)?.value,
                       "fresh")
        XCTAssertNil(fake.item(dataProtection: false, service: service, account: account),
                     "a stale legacy copy of a rotated secret must not survive")
    }

    func testDeleteRemovesBothCopiesSoNothingResurrects() throws {
        let fake = FakeKeychain()
        fake.seedLegacy(service: service, account: account, value: "legacy")
        let manager = makeManager(fake)
        try manager.save(value: "current", account: account, service: service)

        try manager.delete(account: account, service: service)
        XCTAssertEqual(fake.count, 0)
        XCTAssertFalse(manager.exists(account: account, service: service))
        XCTAssertThrowsError(try manager.read(account: account, service: service))
    }

    func testExistsSeesALegacyOnlyItem() {
        let fake = FakeKeychain()
        fake.seedLegacy(service: service, account: account, value: "legacy")
        XCTAssertTrue(makeManager(fake).exists(account: account, service: service))
    }

    func testMigrationCanBeDisabledForFreshInstalls() {
        let fake = FakeKeychain()
        fake.seedLegacy(service: service, account: account, value: "legacy")
        let manager = makeManager(fake, migrates: false)

        XCTAssertFalse(manager.exists(account: account, service: service))
        XCTAssertThrowsError(try manager.read(account: account, service: service))
        XCTAssertEqual(fake.item(dataProtection: false, service: service, account: account)?.value,
                       "legacy", "disabling migration must not touch the legacy item")
    }

    func testMissingItemStillThrowsItemNotFound() {
        let fake = FakeKeychain()
        XCTAssertThrowsError(try makeManager(fake).read(account: account, service: service)) { error in
            guard case KeychainError.itemNotFound = error else {
                return XCTFail("expected itemNotFound, got \(error)")
            }
        }
    }

    func testAdminCredentialRoundTripUsesTheScopedService() throws {
        let fake = FakeKeychain()
        let manager = makeManager(fake)
        let secretId = UUID()

        try manager.storeAdminCredential("admin-token", connectorId: "stripe", secretId: secretId)
        XCTAssertEqual(try manager.adminCredential(connectorId: "stripe", secretId: secretId),
                       "admin-token")

        let expected = KeychainManager.credentialService(connectorId: "stripe", secretId: secretId)
        XCTAssertNotNil(fake.item(dataProtection: true, service: expected, account: "stripe"))

        try manager.deleteAdminCredential(connectorId: "stripe", secretId: secretId)
        XCTAssertEqual(fake.count, 0)
    }
}
#endif // canImport(Security)
