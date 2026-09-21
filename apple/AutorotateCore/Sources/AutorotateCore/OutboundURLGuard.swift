//
//  OutboundURLGuard.swift
//  AutorotateCore
//
//  Parity with apps/web `netguard.ts` (F1, F10, AR-09).  Refuses outbound
//  HTTP requests to RFC1918 / loopback / link-local / multicast / CGNAT
//  destinations so a misconfigured webhook, Infisical baseUrl, or generic
//  REST connector cannot be pointed at an internal endpoint or an SSRF
//  target.
//

import Foundation

public enum OutboundURLError: Error, CustomStringConvertible, Sendable {
    case invalidURL
    case unsafeScheme(String)
    case forbiddenHost(String)
    case unresolvedHost(String)

    public var description: String {
        switch self {
        case .invalidURL:                return "outbound URL is invalid"
        case .unsafeScheme(let s):       return "outbound scheme \(s) is not allowed (https only)"
        case .forbiddenHost(let h):      return "outbound host \(h) is in a blocked range"
        case .unresolvedHost(let h):     return "outbound host \(h) could not be resolved"
        }
    }
}

/// AR31-28 (2026-09-20): the Apple HTTP client previously had no URL
/// policy at all — a webhook configured with `http://192.168.1.10/hook`
/// or `http://169.254.169.254/` (cloud metadata) would happily post the
/// plaintext to it.  Mirrors the web-side `netguard.ts` check so a
/// connector added on one platform has the same defaults on the other.
public enum OutboundURLGuard {

    /// Public, static, opt-in allowlist for non-https URLs.  Currently
    /// empty — every Autorotate-owned destination is HTTPS.  The hook
    /// exists so a future test target can register `http://localhost`
    /// without weakening the production default.
    nonisolated(unsafe) public static var allowedInsecureSchemes: Set<String> = []

    /// Returns whether the given IPv4 address is in a range the engine
    /// refuses to reach.
    public static func isForbiddenIPv4(_ address: in_addr) -> Bool {
        let raw = address.s_addr.bigEndian
        let octets = (raw >> 24) & 0xff
        let b2 = (raw >> 16) & 0xff
        switch octets {
        case 0:           return true   // 0.0.0.0/8           — "this network"
        case 10:          return true   // 10.0.0.0/8          — RFC1918
        case 127:         return true   // 127.0.0.0/8         — loopback
        case 169:
            return b2 == 254              // 169.254.0.0/16     — link-local
        case 172:
            return b2 >= 16 && b2 <= 31   // 172.16.0.0/12      — RFC1918
        case 192:
            return b2 == 168              // 192.168.0.0/16     — RFC1918
        case 100:
            return b2 >= 64 && b2 <= 127  // 100.64.0.0/10      — CGNAT (RFC6598)
        case 224...239:   return true   // 224.0.0.0/4         — multicast
        case 240...255:   return true   // 240.0.0.0/4         — reserved / broadcast
        default:          return false
        }
    }

    /// Returns whether the given IPv6 address is in a range the engine
    /// refuses to reach.
    public static func isForbiddenIPv6(_ address: in6_addr) -> Bool {
        // Read the 16 bytes directly — keeps the comparison in the
        // canonical network-byte-order form the kernel uses, so there is
        // no byte-swap bookkeeping between the union reads and the IPv4
        // mapping step below.
        let bytes = address.__u6_addr.__u6_addr8
        let b0  = UInt32(bytes.0)
        let b1  = UInt32(bytes.1)
        let b2  = UInt32(bytes.2)
        let b3  = UInt32(bytes.3)
        let b4  = UInt32(bytes.4)
        let b5  = UInt32(bytes.5)
        let b6  = UInt32(bytes.6)
        let b7  = UInt32(bytes.7)
        let b8  = UInt32(bytes.8)
        let b9  = UInt32(bytes.9)
        let b10 = UInt32(bytes.10)
        let b11 = UInt32(bytes.11)
        let b12 = UInt32(bytes.12)
        let b13 = UInt32(bytes.13)
        let b14 = UInt32(bytes.14)
        let b15 = UInt32(bytes.15)

        // ::1/128 — loopback.  Bytes 0-14 are zero, byte 15 is 1.
        if b0 == 0 && b1 == 0 && b2 == 0 && b3 == 0
            && b4 == 0 && b5 == 0 && b6 == 0 && b7 == 0
            && b8 == 0 && b9 == 0 && b10 == 0 && b11 == 0
            && b12 == 0 && b13 == 0 && b14 == 0 && b15 == 1 {
            return true
        }
        // ::/128 — unspecified.
        if b0 == 0 && b1 == 0 && b2 == 0 && b3 == 0
            && b4 == 0 && b5 == 0 && b6 == 0 && b7 == 0
            && b8 == 0 && b9 == 0 && b10 == 0 && b11 == 0
            && b12 == 0 && b13 == 0 && b14 == 0 && b15 == 0 {
            return true
        }
        // fe80::/10 — link-local.  bytes 0 = 0xfe, byte 1 in 0x80..0xbf.
        if b0 == 0xfe && (b1 & 0xc0) == 0x80 { return true }
        // fc00::/7 — unique local.  bytes 0 in 0xfc..0xfd.
        if (b0 & 0xfe) == 0xfc { return true }
        // ff00::/8 — multicast.  byte 0 = 0xff.
        if b0 == 0xff { return true }
        // ::ffff:0:0/96 — IPv4-mapped.  bytes 0-9 are zero, bytes 10-11
        // are 0xff, bytes 12-15 carry the IPv4 address in network byte
        // order.  Re-check via the v4 list and return its verdict.
        if b0 == 0 && b1 == 0 && b2 == 0 && b3 == 0
            && b4 == 0 && b5 == 0 && b6 == 0 && b7 == 0
            && b8 == 0 && b9 == 0 && b10 == 0xff && b11 == 0xff {
            var v4 = in_addr()
            // bytes 12..15 are already in network byte order; build a
            // UInt32 from the explicit big-endian initializer so the
            // bit pattern lands in memory in the order `in_addr.s_addr`
            // expects (NBO on every platform).
            let v4Bits = (b12 << 24) | (b13 << 16) | (b14 << 8) | b15
            v4.s_addr = UInt32(bigEndian: v4Bits)
            return isForbiddenIPv4(v4)
        }
        return false
    }

    /// Validates a URL string.  Returns the resolved hostname on success.
    /// Throws ``OutboundURLError`` when the URL is unsafe.
    public static func assertSafeOutboundURL(
        _ raw: String,
        allowedInsecure: Set<String> = []
    ) throws {
        guard let url = URL(string: raw),
              let host = url.host, !host.isEmpty else {
            throw OutboundURLError.invalidURL
        }
        guard let scheme = url.scheme?.lowercased() else {
            throw OutboundURLError.invalidURL
        }
        if scheme == "https" {
            // ok
        } else if scheme == "http" && (allowedInsecure.contains(host)
                                       || OutboundURLGuard.allowedInsecureSchemes.contains(host)) {
            // explicitly allowlisted
        } else {
            throw OutboundURLError.unsafeScheme(scheme)
        }

        // IP literal?  Check directly.
        var addr = in_addr()
        var addr6 = in6_addr()
        let hostC = (host as NSString).utf8String
        if inet_pton(AF_INET, hostC, &addr) == 1 {
            if isForbiddenIPv4(addr) {
                throw OutboundURLError.forbiddenHost(host)
            }
            return
        }
        if inet_pton(AF_INET6, hostC, &addr6) == 1 {
            if isForbiddenIPv6(addr6) {
                throw OutboundURLError.forbiddenHost(host)
            }
            return
        }

        // Hostname — resolve it.  We have to DNS-resolve, which on iOS uses
        // a system resolver we can't override here, so the check is
        // best-effort for DNS-rebinding (a hostname that resolves to a
        // private IP would still be caught on the *next* request, and the
        // webhook-specific call sites should use the resolved-IP allowlist
        // when reach matters more than the hostname).
        var hints = addrinfo()
        hints.ai_family = PF_UNSPEC
        hints.ai_socktype = SOCK_STREAM
        var result: UnsafeMutablePointer<addrinfo>?
        let err = getaddrinfo(host, nil, &hints, &result)
        guard err == 0, let head = result else {
            // Unresolvable is treated as unsafe — better to fail than to
            // assume the operator typed something private.
            throw OutboundURLError.unresolvedHost(host)
        }
        defer { freeaddrinfo(head) }
        for ptr in sequence(first: head, next: { $0.pointee.ai_next }) {
            let ai = ptr.pointee
            switch Int32(ai.ai_family) {
            case AF_INET:
                let sockaddr = ai.ai_addr.withMemoryRebound(
                    to: sockaddr_in.self, capacity: 1
                ) { $0.pointee }
                if isForbiddenIPv4(sockaddr.sin_addr) {
                    throw OutboundURLError.forbiddenHost(host)
                }
            case AF_INET6:
                let sockaddr = ai.ai_addr.withMemoryRebound(
                    to: sockaddr_in6.self, capacity: 1
                ) { $0.pointee }
                if isForbiddenIPv6(sockaddr.sin6_addr) {
                    throw OutboundURLError.forbiddenHost(host)
                }
            default:
                continue
            }
        }
    }
}
