//
//  TopSpinCoreTests.swift
//  TopSpinCoreTests
//
//  Focused unit tests for the dependency-free parts of TopSpinCore:
//  fingerprints, file-target parsers, models, and the generic REST JSON
//  path extraction. Run with `swift test` (macOS/Linux CI).
//

import XCTest
@testable import TopSpinCore

final class FingerprintTests: XCTestCase {
    func testFingerprintIsSha256Prefix() {
        // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        XCTAssertEqual(Fingerprint.of("hello"), "2cf24dba")
        XCTAssertEqual(Fingerprint.of("hello").count, Fingerprint.prefixLength)
    }

    func testGeneratedValuesAreRandomAndPrefixed() {
        let a = SecretGenerator.randomValue(length: 40, prefix: "ts_")
        let b = SecretGenerator.randomValue(length: 40, prefix: "ts_")
        XCTAssertNotEqual(a, b)
        XCTAssertTrue(a.hasPrefix("ts_"))
        XCTAssertEqual(a.count, 43)
    }
}

final class FileTargetParserTests: XCTestCase {
    func testDotenvSetReplacesAndPreservesComments() {
        let input = "# comment\nAPI_KEY=old\nOTHER=1\n"
        let out = FileTargetEngine.dotenvSet(key: "API_KEY", value: "new", in: input)
        XCTAssertTrue(out.contains("# comment"))
        XCTAssertTrue(out.contains("API_KEY=new"))
        XCTAssertTrue(out.contains("OTHER=1"))
        XCTAssertEqual(FileTargetEngine.dotenvGet(key: "API_KEY", in: out), "new")
    }

    func testDotenvSetAppendsMissingKey() {
        let out = FileTargetEngine.dotenvSet(key: "NEW", value: "v", in: "A=1\n")
        XCTAssertEqual(FileTargetEngine.dotenvGet(key: "NEW", in: out), "v")
    }

    func testDotenvHandlesExportAndQuotes() {
        let out = FileTargetEngine.dotenvSet(key: "KEY", value: "v2", in: "export KEY=\"v1\"\n")
        XCTAssertTrue(out.contains("export KEY=v2"))
    }

    func testIniSetWithinSection() {
        let input = "[default]\naws_access_key_id = OLD\n\n[other]\naws_access_key_id = KEEP\n"
        let out = try! FileTargetEngine.iniSet(key: "aws_access_key_id", value: "NEW",
                                               section: "default", in: input)
        XCTAssertEqual(FileTargetEngine.iniGet(key: "aws_access_key_id", section: "default", in: out), "NEW")
        XCTAssertEqual(FileTargetEngine.iniGet(key: "aws_access_key_id", section: "other", in: out), "KEEP")
    }

    func testIniSetCreatesMissingSection() {
        let out = try! FileTargetEngine.iniSet(key: "k", value: "v", section: "prod", in: "[default]\nk = 1\n")
        XCTAssertTrue(out.contains("[prod]"))
        XCTAssertEqual(FileTargetEngine.iniGet(key: "k", section: "prod", in: out), "v")
    }

    func testJsonNestedSet() throws {
        let input = "{\"a\":{\"b\":{\"c\":\"old\"}},\"x\":1}"
        let out = try FileTargetEngine.jsonSet(keyPath: "a.b.c", value: "new", in: input)
        XCTAssertEqual(FileTargetEngine.jsonGet(keyPath: "a.b.c", in: out), "new")
        // Non-string values survive the round-trip (jsonGet only returns strings).
        let reparsed = try JSONSerialization.jsonObject(with: out.data(using: .utf8)!) as? [String: Any]
        XCTAssertEqual(reparsed?["x"] as? Int, 1)
    }

    func testYamlFlatKey() throws {
        let input = "# header\napi_key: old\nnested:\n  inner: keep\n"
        let out = try FileTargetEngine.yamlSet(key: "api_key", value: "new", in: input)
        XCTAssertEqual(FileTargetEngine.yamlGet(key: "api_key", in: out), "new")
        XCTAssertTrue(out.contains("  inner: keep"))
        XCTAssertThrowsError(try FileTargetEngine.yamlSet(key: "nested.inner", value: "x", in: input))
    }

    func testTomlFlatAndTable() throws {
        let input = "title = \"cfg\"\n\n[owner]\nname = \"old\" # trailing\n"
        let out = try FileTargetEngine.tomlSet(key: "name", value: "new", table: "owner", in: input)
        XCTAssertEqual(FileTargetEngine.tomlGet(key: "name", table: "owner", in: out), "new")
        XCTAssertTrue(out.contains("# trailing"), "trailing comment preserved")
        XCTAssertEqual(FileTargetEngine.tomlGet(key: "title", table: nil, in: out), "cfg")
    }

    func testAtomicWriteRoundTrip() throws {
        let dir = NSTemporaryDirectory()
        let path = (dir as NSString).appendingPathComponent("topspin-test-\(UUID().uuidString).env")
        defer { try? FileManager.default.removeItem(atPath: path) }
        let config = FileTargetConfig(path: path, format: .dotenv, keyPath: "SECRET")
        let engine = FileTargetEngine()
        try engine.setValue("value-1", in: config)
        XCTAssertEqual(try engine.getValue(from: config), "value-1")
        try engine.setValue("value-2", in: config)
        XCTAssertEqual(try engine.getValue(from: config), "value-2")
    }
}

final class ModelTests: XCTestCase {
    func testPolicyNextDue() {
        let policy = RotationPolicy(intervalHours: 24)
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        XCTAssertEqual(policy.nextDue(after: base), base.addingTimeInterval(24 * 3600))
    }

    func testIsDue() {
        var record = SecretRecord(name: "S", connectorId: "stripe",
                                  policy: RotationPolicy(intervalHours: 24, autoRotate: true))
        XCTAssertTrue(record.isDue(at: Date())) // never rotated
        record.lastRotatedAt = Date()
        XCTAssertFalse(record.isDue(at: Date()))
        record.status = .disabled
        XCTAssertFalse(record.isDue(at: Date()))
    }

    func testTargetBindingRoundTrip() throws {
        let binding: TargetBinding = .file(FileTargetConfig(
            path: "~/.aws/credentials", format: .ini,
            keyPath: "aws_secret_access_key", section: "default"))
        let data = try JSONEncoder().encode(binding)
        let decoded = try JSONDecoder().decode(TargetBinding.self, from: data)
        XCTAssertEqual(decoded, binding)
        XCTAssertEqual(decoded.kind, .file)
    }

    func testConnectorRegistryCoversMatrix() {
        XCTAssertEqual(ConnectorRegistry.shipped.count, 15)
        XCTAssertGreaterThanOrEqual(ConnectorRegistry.all.count, 40)
        XCTAssertEqual(ConnectorRegistry.capability(of: "vercel"), .updateOnly)
        XCTAssertEqual(ConnectorRegistry.capability(of: "github"), .partial)
        XCTAssertEqual(ConnectorRegistry.capability(of: "aws.iam"), .programmatic)
        XCTAssertEqual(ConnectorRegistry.capability(of: "coolify"), .updateOnly)
    }
}

final class GenericRESTConnectorTests: XCTestCase {
    func testJSONPathExtraction() {
        let json = #"{"data":{"token":"abc","nested":{"list":["x","y"]}}}"#.data(using: .utf8)!
        XCTAssertEqual(GenericRESTConnector.extract("data.token", from: json), "abc")
        XCTAssertEqual(GenericRESTConnector.extract("data.nested.list.1", from: json), "y")
        XCTAssertNil(GenericRESTConnector.extract("data.missing", from: json))
    }

    func testUpdateOnlyConnectorsThrow() async {
        let vercel = VercelConnector()
        do {
            _ = try await vercel.rotate(adminCredential: "x")
            XCTFail("updateOnly connector must not rotate programmatically")
        } catch let error as ConnectorError {
            guard case .manualRotationRequired = error else {
                return XCTFail("wrong error: \(error)")
            }
        } catch {
            XCTFail("wrong error type: \(error)")
        }
    }

    func testImportedValueValidation() async {
        let slack = SlackConnector()
        let value = try? await slack.validateImportedValue("  xoxb-new  ", adminCredential: "")
        XCTAssertEqual(value, "xoxb-new")
        let stripe = StripeConnector()
        do {
            _ = try await stripe.validateImportedValue("rk_live_x", adminCredential: "")
            XCTFail("programmatic connectors reject imports")
        } catch {
            // expected: ConnectorError.importNotSupported
        }
    }
}

final class CredentialParsingTests: XCTestCase {
    func testAWSCredentialSplit() throws {
        let (key, secret) = try AWSIAMConnector.splitCredential("AKIAEXAMPLE:secret123")
        XCTAssertEqual(key, "AKIAEXAMPLE")
        XCTAssertEqual(secret, "secret123")
        XCTAssertThrowsError(try AWSIAMConnector.splitCredential("noColon"))
    }

    func testNpmCredentialParsing() throws {
        let (headers, otp) = try NpmConnector.parseCredential("basic:user:pass:123456")
        XCTAssertEqual(headers["Authorization"], "Basic dXNlcjpwYXNz")
        XCTAssertEqual(otp, "123456")
        let (bearer, noOtp) = try NpmConnector.parseCredential("bearer:npm_xxx")
        XCTAssertEqual(bearer["Authorization"], "Bearer npm_xxx")
        XCTAssertNil(noOtp)
    }
}

/// End-to-end pipeline test with a scripted connector and in-memory stores.
final class RotationEngineTests: XCTestCase {

    /// Connector stub that returns a deterministic value.
    struct StubConnector: SecretConnector {
        var id: String { "stub" }
        var displayName: String { "Stub" }
        var capability: ConnectorCapability { .programmatic }
        func rotate(adminCredential: String) async throws -> String { "rotated-value-1" }
    }

    func testFullPipelineCommits() async throws {
        let secrets = InMemorySecretStore()
        let audit = InMemoryAuditStore()
        let runs = InMemoryRotationRunStore()

        let envPath = (NSTemporaryDirectory() as NSString)
            .appendingPathComponent("topspin-engine-\(UUID().uuidString).env")
        defer { try? FileManager.default.removeItem(atPath: envPath) }

        var record = SecretRecord(
            name: "MY_SECRET",
            connectorId: "stub",
            policy: RotationPolicy(intervalHours: 24, autoRotate: true, verifyAfterWrite: true),
            targets: [.file(FileTargetConfig(path: envPath, format: .dotenv, keyPath: "MY_SECRET"))])
        try await secrets.saveSecret(record)

        let engine = RotationEngine(dependencies: .init(
            secretStore: secrets,
            auditStore: audit,
            runStore: runs,
            credentialProvider: ClosureCredentialProvider { _, _ in "admin" },
            connectorProvider: { _ in StubConnector() },
            infisicalClientProvider: { _ in
                XCTFail("no infisical target in this test")
                return InfisicalClient()
            }))

        let run = await engine.rotate(secretId: record.id, actor: "user:test")
        XCTAssertEqual(run.status, .committed)
        XCTAssertEqual(run.fingerprint, Fingerprint.of("rotated-value-1"))
        XCTAssertEqual(try FileTargetEngine().getValue(
            from: FileTargetConfig(path: envPath, format: .dotenv, keyPath: "MY_SECRET")),
            "rotated-value-1")

        record = try await secrets.secret(id: record.id)!
        XCTAssertEqual(record.version, 1)
        XCTAssertEqual(record.status, .active)
        XCTAssertEqual(record.fingerprint, Fingerprint.of("rotated-value-1"))

        let entries = try await audit.recent(limit: 10)
        XCTAssertTrue(entries.contains { $0.action == .rotationCommitted })
        XCTAssertTrue(entries.allSatisfy { !$0.detail.values.contains("rotated-value-1") },
                      "audit log must never contain plaintext values")
    }

    func testLockSkipsConcurrentRun() async throws {
        let secrets = InMemorySecretStore()
        let audit = InMemoryAuditStore()
        let record = SecretRecord(name: "S", connectorId: "stub")
        try await secrets.saveSecret(record)

        struct SlowConnector: SecretConnector {
            var id: String { "stub" }
            var displayName: String { "Stub" }
            var capability: ConnectorCapability { .programmatic }
            func rotate(adminCredential: String) async throws -> String {
                try await Task.sleep(nanoseconds: 400_000_000)
                return "v"
            }
        }

        let engine = RotationEngine(dependencies: .init(
            secretStore: secrets,
            auditStore: audit,
            credentialProvider: ClosureCredentialProvider { _, _ in "admin" },
            connectorProvider: { _ in SlowConnector() },
            infisicalClientProvider: { _ in InfisicalClient() }))

        async let first = engine.rotate(secretId: record.id, actor: "a")
        try await Task.sleep(nanoseconds: 50_000_000)
        let second = await engine.rotate(secretId: record.id, actor: "b")
        let firstResult = await first
        XCTAssertEqual(firstResult.status, .committed)
        XCTAssertEqual(second.status, .skippedLocked)
    }
}

final class CatalogConnectorTests: XCTestCase {
    func testRegistryIdsAreUniqueAndIncludeGrokCatalog() {
        let ids = ConnectorRegistry.all.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count)
        XCTAssertNotNil(ConnectorRegistry.descriptor(for: "coolify"))
        XCTAssertNotNil(ConnectorRegistry.descriptor(for: "xai"))
        XCTAssertEqual(ConnectorRegistry.capability(of: "jwt"), .programmatic)
        XCTAssertEqual(ConnectorRegistry.capability(of: "coolify"), .updateOnly)
        XCTAssertNil(ConnectorRegistry.makeCatalogConnector(id: "github"))
        XCTAssertNotNil(ConnectorRegistry.makeCatalogConnector(id: "coolify"))
    }

    func testCatalogGenerateMintsLocalValue() async throws {
        let jwt = ConnectorRegistry.makeCatalogConnector(id: "jwt")!
        let a = try await jwt.rotate(adminCredential: "")
        let b = try await jwt.rotate(adminCredential: "")
        XCTAssertEqual(a.count, 64)
        XCTAssertNotEqual(a, b)
    }

    func testCatalogUpdateOnlyRequiresImport() async {
        let coolify = ConnectorRegistry.makeCatalogConnector(id: "coolify")!
        do {
            _ = try await coolify.rotate(adminCredential: "token")
            XCTFail("update-only catalog should not mint via rotate()")
        } catch ConnectorError.manualRotationRequired(let id) {
            XCTAssertEqual(id, "coolify")
        } catch {
            XCTFail("unexpected error \(error)")
        }
    }
}
