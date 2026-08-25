//
//  InfisicalClient.swift
//  AutorotateCore
//
//  Infisical REST client (architecture.md §4).
//
//  - Auth: Universal Auth — `POST /api/v1/auth/universal-auth/login` with
//    clientId/clientSecret → short-lived access token.
//  - Upsert: `POST /api/v3/secrets/raw/{secretName}`.
//  - Read-back verify: `GET /api/v3/secrets/raw/{secretName}`.
//
//  The clientSecret is NEVER stored by this type; callers fetch it from the
//  Keychain (`KeychainManager`) per call or hold it in memory for the
//  duration of a rotation run.
//

import Foundation

/// Errors thrown by ``InfisicalClient``.
public enum InfisicalError: Error, Sendable, CustomStringConvertible {
    /// Universal Auth login failed or returned an unexpected body.
    case authenticationFailed(String)
    /// A secrets API call failed. Message is a sanitized HTTP excerpt.
    case requestFailed(String)
    /// The requested secret does not exist at the given path/environment.
    case secretNotFound(name: String)
    /// Response JSON did not match the expected Infisical shape.
    case unexpectedResponse(String)
    /// The configured base URL is invalid.
    case invalidBaseURL(String)

    public var description: String {
        switch self {
        case .authenticationFailed(let m): return "Infisical auth failed: \(m)"
        case .requestFailed(let m):        return "Infisical request failed: \(m)"
        case .secretNotFound(let name):    return "Infisical secret not found: \(name)"
        case .unexpectedResponse(let m):   return "Infisical unexpected response: \(m)"
        case .invalidBaseURL(let m):       return "Infisical invalid base URL: \(m)"
        }
    }
}

/// A secret value returned by the Infisical read-back endpoint.
public struct InfisicalSecret: Sendable, Equatable {
    public let name: String
    /// Plaintext value — in memory only; never persist.
    public let value: String
    public let environment: String
    public let path: String

    public init(name: String, value: String, environment: String, path: String) {
        self.name = name
        self.value = value
        self.environment = environment
        self.path = path
    }
}

/// Async REST client for Infisical.
public struct InfisicalClient: Sendable {

    /// Base URL of the Infisical instance, e.g. `https://app.infisical.com`
    /// or a self-hosted deployment.
    public let baseUrl: URL

    /// HTTP transport (injectable for tests).
    public let http: HTTPClient

    /// Cached Universal Auth token, if `authenticate` was called on this
    /// value. Tokens are short-lived; the engine authenticates once per run.
    public let accessToken: String?

    public init(baseUrl: URL = URL(string: "https://app.infisical.com")!,
                http: HTTPClient = HTTPClient(),
                accessToken: String? = nil) {
        self.baseUrl = baseUrl
        self.http = http
        self.accessToken = accessToken
    }

    // MARK: - Universal Auth

    /// Response shape of `POST /api/v1/auth/universal-auth/login`.
    private struct UniversalAuthResponse: Decodable {
        let accessToken: String
        let expiresIn: Int?
        let tokenType: String?
    }

    /// Exchanges Universal Auth credentials for an access token.
    ///
    /// - Parameters:
    ///   - clientId: Universal Auth client id (stored in connector/target
    ///     config — not secret).
    ///   - clientSecret: Universal Auth client secret. On native builds this
    ///     is fetched from the Keychain immediately before the call and
    ///     never persisted.
    /// - Returns: A new client with `accessToken` set.
    public func authenticate(clientId: String, clientSecret: String) async throws -> InfisicalClient {
        let url = try endpoint("/api/v1/auth/universal-auth/login")
        let request = try HTTPClient.makeRequest(
            method: "POST",
            url: url,
            headers: ["Accept": "application/json"],
            formBody: [
                "clientId": clientId,
                "clientSecret": clientSecret
            ])
        do {
            let body = try await http.sendJSON(UniversalAuthResponse.self, request: request)
            return InfisicalClient(baseUrl: baseUrl, http: http, accessToken: body.accessToken)
        } catch let error as HTTPError {
            throw InfisicalError.authenticationFailed(error.description)
        }
    }

    // MARK: - Raw secrets v3

    /// Body of `POST /api/v3/secrets/raw/{secretName}`.
    private struct UpsertRequest: Encodable {
        let workspaceId: String
        let environment: String
        let secretPath: String
        let secretValue: String
        let type: String
    }

    /// Upserts a raw secret (create or update).
    ///
    /// - Parameters:
    ///   - name: Secret name (key) inside Infisical.
    ///   - value: New plaintext value — in-memory only.
    ///   - workspaceId: Infisical project/workspace id.
    ///   - environment: Environment slug, e.g. `prod`.
    ///   - secretPath: Folder path, e.g. `/` or `/backend`.
    ///   - type: `shared` (default) or `personal`.
    public func upsertSecret(name: String,
                             value: String,
                             workspaceId: String,
                             environment: String,
                             secretPath: String = "/",
                             type: String = "shared") async throws {
        let token = try requireToken()
        let url = try endpoint("/api/v3/secrets/raw/\(urlEscape(name))")
        let body = UpsertRequest(workspaceId: workspaceId,
                                 environment: environment,
                                 secretPath: secretPath,
                                 secretValue: value,
                                 type: type)
        let request = try HTTPClient.makeRequest(
            method: "POST",
            url: url,
            headers: authorizedHeaders(token),
            jsonBody: body)
        do {
            try await http.send(request)
        } catch let error as HTTPError {
            throw InfisicalError.requestFailed(error.description)
        }
    }

    /// Response shape of `GET /api/v3/secrets/raw/{secretName}`.
    private struct RawSecretResponse: Decodable {
        struct Secret: Decodable {
            let secretKey: String
            let secretValue: String
            let env: String?
            let secretPath: String?
        }
        let secret: Secret
    }

    /// Reads a raw secret back — used by the VERIFY pipeline step.
    public func getSecret(name: String,
                          workspaceId: String,
                          environment: String,
                          secretPath: String = "/",
                          type: String = "shared") async throws -> InfisicalSecret {
        let token = try requireToken()
        var components = URLComponents(url: try endpoint("/api/v3/secrets/raw/\(urlEscape(name))"),
                                       resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "workspaceId", value: workspaceId),
            URLQueryItem(name: "environment", value: environment),
            URLQueryItem(name: "secretPath", value: secretPath),
            URLQueryItem(name: "type", value: type)
        ]
        guard let url = components?.url else {
            throw InfisicalError.invalidBaseURL(baseUrl.absoluteString)
        }
        let request = try HTTPClient.makeRequest(method: "GET",
                                                 url: url,
                                                 headers: authorizedHeaders(token))
        do {
            let body = try await http.sendJSON(RawSecretResponse.self, request: request)
            return InfisicalSecret(name: body.secret.secretKey,
                                   value: body.secret.secretValue,
                                   environment: body.secret.env ?? environment,
                                   path: body.secret.secretPath ?? secretPath)
        } catch let error as HTTPError {
            if case .unexpectedStatus(let code, _) = error, code == 404 {
                throw InfisicalError.secretNotFound(name: name)
            }
            throw InfisicalError.requestFailed(error.description)
        }
    }

    // MARK: - Helpers

    private func requireToken() throws -> String {
        guard let accessToken, !accessToken.isEmpty else {
            throw InfisicalError.authenticationFailed(
                "No access token — call authenticate(clientId:clientSecret:) first.")
        }
        return accessToken
    }

    private func authorizedHeaders(_ token: String) -> [String: String] {
        ["Authorization": "Bearer \(token)", "Accept": "application/json"]
    }

    private func endpoint(_ path: String) throws -> URL {
        guard let url = URL(string: path, relativeTo: baseUrl)?.absoluteURL else {
            throw InfisicalError.invalidBaseURL(baseUrl.absoluteString)
        }
        return url
    }

    /// Path-component escaping for secret names (Infisical names are usually
    /// `SCREAMING_SNAKE`, but we escape defensively).
    private func urlEscape(_ name: String) -> String {
        name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
    }
}
