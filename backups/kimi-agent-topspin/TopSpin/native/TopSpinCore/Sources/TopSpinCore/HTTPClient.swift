//
//  HTTPClient.swift
//  TopSpinCore
//
//  Minimal async/await URLSession wrapper shared by all connectors and the
//  Infisical client. No third-party dependencies.
//

import Foundation
#if canImport(FoundationNetworking)
// URLSession/URLRequest live in FoundationNetworking off-Darwin (Linux CI).
import FoundationNetworking
#endif

/// Errors thrown by the shared HTTP layer. Carries a sanitized response body
/// excerpt for diagnostics — never request bodies (which may contain the new
/// secret value).
public enum HTTPError: Error, Sendable, CustomStringConvertible {
    /// The URL could not be constructed from the configured parts.
    case invalidURL(String)
    /// The response was not an HTTP response.
    case notHTTP
    /// Non-2xx status. `bodyExcerpt` is truncated to 300 characters.
    case unexpectedStatus(code: Int, bodyExcerpt: String)
    /// Transport-level failure.
    case transport(String)
    /// The response body could not be decoded as expected.
    case decoding(String)

    public var description: String {
        switch self {
        case .invalidURL(let raw): return "Invalid URL: \(raw)"
        case .notHTTP: return "Response was not HTTP"
        case .unexpectedStatus(let code, let body):
            return "HTTP \(code): \(body)"
        case .transport(let message): return "Transport error: \(message)"
        case .decoding(let message): return "Decoding error: \(message)"
        }
    }
}

/// A small, testable async HTTP client built on URLSession.
///
/// Inject a custom `URLSession` (e.g. with an ephemeral configuration in
/// tests) via the initializer. The default session sets a conservative
/// 30-second timeout.
public struct HTTPClient: Sendable {

    /// Result of a performed request.
    public struct Response: Sendable {
        public let statusCode: Int
        public let data: Data
        public let headers: [String: String]

        /// Body decoded as UTF-8 text (empty string when undecodable).
        public var text: String { String(data: data, encoding: .utf8) ?? "" }

        /// Body decoded as JSON, when possible.
        public func decodeJSON<T: Decodable>(_ type: T.Type,
                                             decoder: JSONDecoder = JSONDecoder()) throws -> T {
            do {
                return try decoder.decode(type, from: data)
            } catch {
                throw HTTPError.decoding("\(T.self): \(error.localizedDescription)")
            }
        }
    }

    public let session: URLSession

    public init(session: URLSession = HTTPClient.makeDefaultSession()) {
        self.session = session
    }

    /// Default session configuration: 30s timeouts, no on-disk caching of
    /// credential material.
    public static func makeDefaultSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        config.urlCache = nil
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        return URLSession(configuration: config)
    }

    // MARK: - Request building

    /// Builds a `URLRequest` with JSON body encoding helpers.
    ///
    /// - Parameters:
    ///   - method: HTTP method, e.g. `GET`, `POST`, `PUT`, `DELETE`.
    ///   - url: Fully-formed URL.
    ///   - headers: Header dictionary (values may contain credentials; they
    ///     are never logged by this type).
    ///   - jsonBody: Optional JSON-encodable body (`Encodable`).
    ///   - formBody: Optional `application/x-www-form-urlencoded` body.
    public static func makeRequest(method: String,
                                   url: URL,
                                   headers: [String: String] = [:],
                                   jsonBody: (any Encodable)? = nil,
                                   formBody: [String: String]? = nil) throws -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        for (name, value) in headers {
            request.setValue(value, forHTTPHeaderField: name)
        }
        if let jsonBody {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(AnyEncodable(jsonBody))
        }
        if let formBody {
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = formURLEncode(formBody).data(using: .utf8)
        }
        return request
    }

    /// Percent-encodes a dictionary as `application/x-www-form-urlencoded`.
    public static func formURLEncode(_ fields: [String: String]) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "+&=")
        return fields
            .map { key, value in
                let k = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
                let v = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
                return "\(k)=\(v)"
            }
            .sorted()
            .joined(separator: "&")
    }

    // MARK: - Sending

    /// Performs a request and validates a 2xx status.
    ///
    /// - Parameter acceptedStatusCodes: Status codes treated as success.
    ///   Defaults to 200...299.
    @discardableResult
    public func send(_ request: URLRequest,
                     acceptedStatusCodes: ClosedRange<Int> = 200...299) async throws -> Response {
        let (data, urlResponse): (Data, URLResponse)
        do {
            #if canImport(FoundationNetworking)
            (data, urlResponse) = try await session.asyncData(for: request)
            #else
            (data, urlResponse) = try await session.data(for: request)
            #endif
        } catch {
            throw HTTPError.transport(error.localizedDescription)
        }
        guard let http = urlResponse as? HTTPURLResponse else {
            throw HTTPError.notHTTP
        }
        var headers: [String: String] = [:]
        for case let (name as String, value as String) in http.allHeaderFields {
            headers[name.lowercased()] = value
        }
        let response = Response(statusCode: http.statusCode, data: data, headers: headers)
        guard acceptedStatusCodes.contains(http.statusCode) else {
            // Sanitize: truncate the body so a verbose provider error cannot
            // echo large payloads into logs. Never include the request body.
            let excerpt = String(response.text.prefix(300))
            throw HTTPError.unexpectedStatus(code: http.statusCode, bodyExcerpt: excerpt)
        }
        return response
    }

    /// Convenience: send and decode a JSON body.
    public func sendJSON<T: Decodable>(_ type: T.Type,
                                       request: URLRequest,
                                       acceptedStatusCodes: ClosedRange<Int> = 200...299,
                                       decoder: JSONDecoder = JSONDecoder()) async throws -> T {
        try await send(request, acceptedStatusCodes: acceptedStatusCodes).decodeJSON(type, decoder: decoder)
    }
}

#if canImport(FoundationNetworking)
/// swift-corelibs-foundation's URLSession lacks the async `data(for:)`
/// API; bridge the completion-handler API for Linux CI builds.
private extension URLSession {
    func asyncData(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await withCheckedThrowingContinuation { continuation in
            let task = dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let data, let response {
                    continuation.resume(returning: (data, response))
                } else {
                    continuation.resume(throwing: HTTPError.transport("Empty response."))
                }
            }
            task.resume()
        }
    }
}
#endif

/// Type-erased `Encodable` box so `HTTPClient.makeRequest` can accept any
/// encodable JSON body without a generic signature.
public struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    public init(_ wrapped: any Encodable) {
        self.encodeClosure = { encoder in
            try wrapped.encode(to: encoder)
        }
    }

    public func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}
