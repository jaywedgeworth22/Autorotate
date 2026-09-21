//
//  OutboundURLGuardTests.swift
//  AutorotateCoreTests
//
//  AR31-28 (2026-09-20): parity tests for the new OutboundURLGuard so a
//  future refactor cannot quietly allow a private host.
//

import XCTest
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif
@testable import AutorotateCore

final class OutboundURLGuardTests: XCTestCase {

    // IPv4
    func testBlocksRFC1918_10() throws {
        var addr = in_addr()
        XCTAssertEqual(inet_pton(AF_INET, "10.0.0.5", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv4(addr))
    }

    func testBlocksRFC1918_172() throws {
        var addr = in_addr()
        XCTAssertEqual(inet_pton(AF_INET, "172.16.42.1", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv4(addr))
    }

    func testBlocksRFC1918_192() throws {
        var addr = in_addr()
        XCTAssertEqual(inet_pton(AF_INET, "192.168.1.1", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv4(addr))
    }

    func testBlocksLinkLocal() throws {
        var addr = in_addr()
        XCTAssertEqual(inet_pton(AF_INET, "169.254.169.254", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv4(addr))
    }

    func testBlocksLoopback() throws {
        var addr = in_addr()
        XCTAssertEqual(inet_pton(AF_INET, "127.0.0.1", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv4(addr))
    }

    func testBlocksCGNAT() throws {
        var addr = in_addr()
        XCTAssertEqual(inet_pton(AF_INET, "100.64.1.1", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv4(addr))
    }

    func testAllowsPublicIPv4() throws {
        var addr = in_addr()
        XCTAssertEqual(inet_pton(AF_INET, "8.8.8.8", &addr), 1)
        XCTAssertFalse(OutboundURLGuard.isForbiddenIPv4(addr))
    }

    // IPv6
    func testBlocksIPv6Loopback() throws {
        var addr = in6_addr()
        XCTAssertEqual(inet_pton(AF_INET6, "::1", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv6(addr))
    }

    func testBlocksIPv6LinkLocal() throws {
        var addr = in6_addr()
        XCTAssertEqual(inet_pton(AF_INET6, "fe80::1", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv6(addr))
    }

    func testBlocksIPv6ULA() throws {
        var addr = in6_addr()
        XCTAssertEqual(inet_pton(AF_INET6, "fc00::1", &addr), 1)
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv6(addr))
    }

    func testBlocksIPv4MappedPrivate() throws {
        // AR31-28: build the address bytes directly so we don't depend
        // on the platform's inet_pton parsing of IPv4-mapped forms
        // (which differs across macOS / glibc / musl).  Bytes 8-11 are
        // 0x00 0x00 0xff 0xff (the ::ffff: prefix in network byte
        // order — big-endian on the wire); bytes 12-15 are 0xc0 0xa8
        // 0x01 0x01 (192.168.1.1).
        var addr = in6_addr()
        let bytes: [UInt8] = [
            0, 0, 0, 0,
            0, 0, 0, 0,
            0x00, 0x00, 0xff, 0xff,
            0xc0, 0xa8, 0x01, 0x01,
        ]
        _ = bytes.withUnsafeBufferPointer { src in
            memcpy(&addr, src.baseAddress, src.count)
        }
        XCTAssertTrue(OutboundURLGuard.isForbiddenIPv6(addr))
    }

    func testAllowsPublicIPv6() throws {
        var addr = in6_addr()
        // 2606:4700:4700::1111 — Cloudflare resolver.
        XCTAssertEqual(inet_pton(AF_INET6, "2606:4700:4700::1111", &addr), 1)
        XCTAssertFalse(OutboundURLGuard.isForbiddenIPv6(addr))
    }

    // URL form
    func testRefusesHTTPLiteralPrivate() {
        XCTAssertThrowsError(
            try OutboundURLGuard.assertSafeOutboundURL("http://10.0.0.5/hook")
        ) { error in
            XCTAssertTrue(error is OutboundURLError)
        }
    }

    func testRefusesLinkLocalMetadataEndpoint() {
        XCTAssertThrowsError(
            try OutboundURLGuard.assertSafeOutboundURL("http://169.254.169.254/latest/meta-data/")
        ) { error in
            XCTAssertTrue(error is OutboundURLError)
        }
    }

    func testRefusesHTTPSPrivateIP() {
        XCTAssertThrowsError(
            try OutboundURLGuard.assertSafeOutboundURL("https://192.168.1.10/hook")
        ) { error in
            XCTAssertTrue(error is OutboundURLError)
        }
    }

    func testAllowsHTTPSPublicHostname() throws {
        // Use a real public hostname (Cloudflare) so DNS resolution succeeds
        // on the test runner.
        try OutboundURLGuard.assertSafeOutboundURL("https://one.one.one.one/")
    }

    func testAllowsHTTPSPublicIPv4() throws {
        try OutboundURLGuard.assertSafeOutboundURL("https://8.8.8.8/dns-query")
    }

    func testRefusesUnresolvableHostname() {
        XCTAssertThrowsError(
            // .invalid TLD guaranteed to fail DNS resolution per RFC2606.
            try OutboundURLGuard.assertSafeOutboundURL("https://no-such-host.invalid/")
        ) { error in
            guard case OutboundURLError.unresolvedHost = error else {
                XCTFail("expected unresolvedHost, got \(error)")
                return
            }
        }
    }

    func testRefusesUnknownScheme() {
        XCTAssertThrowsError(
            try OutboundURLGuard.assertSafeOutboundURL("file:///etc/passwd")
        )
    }
}
