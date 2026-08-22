//
//  Crypto.swift
//  TopSpinCore
//
//  SHA-256 / HMAC-SHA256 façade.
//
//  On Apple platforms (the shipping targets) this thinly wraps CryptoKit.
//  A small, self-contained pure-Swift fallback is included so the package
//  also compiles on Linux CI, where CryptoKit is unavailable. The fallback
//  implements FIPS 180-4 directly and is verified by unit tests against
//  published test vectors (e.g. sha256("hello") = 2cf24dba…).
//

import Foundation
#if canImport(CryptoKit)
import CryptoKit
#endif

/// Internal SHA-256 / HMAC-SHA256 used for fingerprints and AWS SigV4.
enum TopSpinSHA256 {

    /// SHA-256 digest bytes of `data`.
    static func hash(_ data: Data) -> Data {
        #if canImport(CryptoKit)
        Data(CryptoKit.SHA256.hash(data: data))
        #else
        Data(SHA256Fallback.hash([UInt8](data)))
        #endif
    }

    /// Lowercase hex SHA-256 digest of `data`.
    static func hashHex(_ data: Data) -> String {
        hash(data).map { String(format: "%02x", $0) }.joined()
    }

    /// HMAC-SHA256 of `message` under `key`.
    static func hmac(key: Data, message: Data) -> Data {
        #if canImport(CryptoKit)
        Data(HMAC<CryptoKit.SHA256>.authenticationCode(for: message,
                                                       using: SymmetricKey(data: key)))
        #else
        Data(SHA256Fallback.hmac(key: [UInt8](key), message: [UInt8](message)))
        #endif
    }
}

#if !canImport(CryptoKit)
/// Pure-Swift SHA-256 (FIPS 180-4) + HMAC (RFC 2104). Linux CI fallback.
enum SHA256Fallback {

    // First 32 bits of the fractional parts of the cube roots of the first
    // 64 primes.
    private static let k: [UInt32] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]

    private static let h0: [UInt32] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]

    /// SHA-256 digest of `message`.
    static func hash(_ message: [UInt8]) -> [UInt8] {
        // Padding: append 0x80, then zeros, then 64-bit big-endian bit length.
        var padded = message
        let bitLength = UInt64(message.count) &* 8
        padded.append(0x80)
        while padded.count % 64 != 56 {
            padded.append(0)
        }
        for shift in stride(from: 56, through: 0, by: -8) {
            padded.append(UInt8((bitLength >> UInt64(shift)) & 0xff))
        }

        var h = h0
        for chunkStart in stride(from: 0, to: padded.count, by: 64) {
            let chunk = padded[chunkStart..<chunkStart + 64]
            var w = [UInt32](repeating: 0, count: 64)
            for i in 0..<16 {
                let base = chunk.startIndex + i * 4
                w[i] = (UInt32(chunk[base]) << 24)
                    | (UInt32(chunk[base + 1]) << 16)
                    | (UInt32(chunk[base + 2]) << 8)
                    | UInt32(chunk[base + 3])
            }
            for i in 16..<64 {
                // σ0(w[i-15]) = ROTR7 ^ ROTR18 ^ SHR3
                let s0 = w[i - 15].rotatedRight(7) ^ w[i - 15].rotatedRight(18) ^ (w[i - 15] >> 3)
                // σ1(w[i-2]) = ROTR17 ^ ROTR19 ^ SHR10
                let s1 = w[i - 2].rotatedRight(17) ^ w[i - 2].rotatedRight(19) ^ (w[i - 2] >> 10)
                w[i] = w[i - 16] &+ s0 &+ w[i - 7] &+ s1
            }

            var a = h[0], b = h[1], c = h[2], d = h[3]
            var e = h[4], f = h[5], g = h[6], hh = h[7]
            for i in 0..<64 {
                let s1 = e.rotatedRight(6) ^ e.rotatedRight(11) ^ e.rotatedRight(25)
                let ch = (e & f) ^ (~e & g)
                let temp1 = hh &+ s1 &+ ch &+ k[i] &+ w[i]
                let s0 = a.rotatedRight(2) ^ a.rotatedRight(13) ^ a.rotatedRight(22)
                let maj = (a & b) ^ (a & c) ^ (b & c)
                let temp2 = s0 &+ maj
                hh = g; g = f; f = e; e = d &+ temp1
                d = c; c = b; b = a; a = temp1 &+ temp2
            }
            h[0] = h[0] &+ a; h[1] = h[1] &+ b; h[2] = h[2] &+ c; h[3] = h[3] &+ d
            h[4] = h[4] &+ e; h[5] = h[5] &+ f; h[6] = h[6] &+ g; h[7] = h[7] &+ hh
        }

        var digest = [UInt8]()
        digest.reserveCapacity(32)
        for word in h {
            digest.append(UInt8((word >> 24) & 0xff))
            digest.append(UInt8((word >> 16) & 0xff))
            digest.append(UInt8((word >> 8) & 0xff))
            digest.append(UInt8(word & 0xff))
        }
        return digest
    }

    /// HMAC-SHA256 (RFC 2104), block size 64.
    static func hmac(key: [UInt8], message: [UInt8]) -> [UInt8] {
        var blockKey = key
        if blockKey.count > 64 {
            blockKey = hash(blockKey)
        }
        if blockKey.count < 64 {
            blockKey.append(contentsOf: [UInt8](repeating: 0, count: 64 - blockKey.count))
        }
        let outerPad = blockKey.map { $0 ^ 0x5c }
        let innerPad = blockKey.map { $0 ^ 0x36 }
        return hash(outerPad + hash(innerPad + message))
    }
}

private extension UInt32 {
    func rotatedRight(_ count: UInt32) -> UInt32 {
        (self >> count) | (self << (32 - count))
    }
}
#endif
