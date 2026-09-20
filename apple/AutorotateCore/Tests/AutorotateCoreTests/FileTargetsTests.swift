//
//  FileTargetsTests.swift
//  AutorotateCoreTests
//
//  AR31-07 (2026-09-20): atomicWrite must create new files with mode
//  0600 so a permissive process umask cannot leak the plaintext to other
//  users on a shared host.
//

import XCTest
@testable import AutorotateCore

final class FileTargetsTests: XCTestCase {

    private var tmpDir: URL!
    private var target: FileTargetEngine!

    override func setUpWithError() throws {
        tmpDir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("autorotate-filetrgt-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tmpDir,
                                               withIntermediateDirectories: true)
        target = FileTargetEngine()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: tmpDir)
    }

    func testNewFileCreatedWith0600() throws {
        // AR31-07: new files must default to owner read+write only.
        let path = tmpDir.appendingPathComponent("new-secret.env").path
        XCTAssertFalse(FileManager.default.fileExists(atPath: path))
        try target.atomicWrite(contents: "KEY=value", to: path)

        let attrs = try FileManager.default.attributesOfItem(atPath: path)
        let perms = (attrs[.posixPermissions] as? NSNumber)?.int16Value ?? 0
        XCTAssertEqual(perms, 0o600,
                       "expected new secret file to be 0600, got 0\(String(perms, radix: 8))")
    }

    func testExistingPermissionsPreserved() throws {
        // AR31-07: when the file already exists, its mode must be
        // preserved — owners may have intentionally chmod'd a wider set
        // (group-read for a service account) and we should not silently
        // tighten.
        let path = tmpDir.appendingPathComponent("existing.env").path
        try "old=value".write(toFile: path, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes(
            [.posixPermissions: NSNumber(value: Int16(0o640))],
            ofItemAtPath: path)

        try target.atomicWrite(contents: "new=value", to: path)

        let attrs = try FileManager.default.attributesOfItem(atPath: path)
        let perms = (attrs[.posixPermissions] as? NSNumber)?.int16Value ?? 0
        XCTAssertEqual(perms, 0o640)
        XCTAssertEqual(try String(contentsOfFile: path, encoding: .utf8), "new=value")
    }

    func testTempFileCleanedUpOnWriteFailure() throws {
        // AR31-07: when the rename fails the temp dotfile must NOT remain
        // on disk — it would carry the plaintext in clear until the
        // operator notices.
        let path = tmpDir.appendingPathComponent("fail-env").path
        try "old=value".write(toFile: path, atomically: true, encoding: .utf8)

        // Force a collision by creating an unwriteable directory at the
        // intended target path.
        let blocker = tmpDir.appendingPathComponent("block-dir")
        try FileManager.default.createDirectory(at: blocker,
                                               withIntermediateDirectories: true)

        let collidingPath = blocker.appendingPathComponent("fail-env").path
        XCTAssertThrowsError(
            try target.atomicWrite(contents: "new=value", to: collidingPath)
        )

        // No leftover dotfiles in the parent directory.
        let remaining = (try? FileManager.default.contentsOfDirectory(atPath: tmpDir.path)) ?? []
        let dotfiles = remaining.filter { $0.hasPrefix(".") && $0.contains(".autorotate-") }
        XCTAssertTrue(dotfiles.isEmpty,
                      "atomicWrite left orphan temp files: \(dotfiles)")
    }
}
