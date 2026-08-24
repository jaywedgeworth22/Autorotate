//
//  Connectors+More.swift
//  TopSpinCore
//
//  Connector implementations, group B: Vercel, Twilio, SendGrid, Slack,
//  npm, Docker Hub, Kubernetes, Infisical-as-source, and the configurable
//  Generic REST connector.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// MARK: - Vercel (update-only)

/// Vercel access tokens are created in the account/team UI — there is no
/// public token-creation API. This connector is `updateOnly`: the user
/// rotates in the Vercel UI and imports the new token; TopSpin propagates
/// it to all targets.
public struct VercelConnector: SecretConnector {

    public static let connectorId = "vercel"

    public var id: String { Self.connectorId }
    public var displayName: String { "Vercel" }
    public var capability: ConnectorCapability { .updateOnly }

    /// Optional team id, kept for display/routing purposes.
    public var teamId: String?

    public init(teamId: String? = nil) {
        self.teamId = teamId
    }

    public func rotate(adminCredential: String) async throws -> String {
        throw ConnectorError.manualRotationRequired(connectorId: id)
    }

    /// Validates an imported token by calling `GET /v2/user` — a cheap,
    /// real verification that the pasted token works.
    public func validateImportedValue(_ newValue: String, adminCredential: String) async throws -> String {
        let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw ConnectorError.invalidCredential("Imported value is empty.")
        }
        return trimmed
    }
}

// MARK: - Twilio

/// Rotates Twilio API keys: creates a new key via
/// `POST /2010-04-01/Accounts/{AccountSid}/Keys.json`, then deletes the old
/// key.
///
/// Admin credential: the account **Auth Token** (the Account SID lives in
/// configuration).
public struct TwilioConnector: SecretConnector {

    public static let connectorId = "twilio"

    public var id: String { Self.connectorId }
    public var displayName: String { "Twilio" }
    public var capability: ConnectorCapability { .programmatic }

    /// Account SID (`AC…`).
    public var accountSid: String
    /// SID of the API key to delete after rotation (`SK…`).
    public var oldKeySid: String
    /// Friendly name for the new key.
    public var newKeyFriendlyName: String

    private let http: HTTPClient
    private static let apiBase = "https://api.twilio.com"

    public init(accountSid: String,
                oldKeySid: String = "",
                newKeyFriendlyName: String = "topspin-rotated",
                http: HTTPClient = HTTPClient()) {
        self.accountSid = accountSid
        self.oldKeySid = oldKeySid
        self.newKeyFriendlyName = newKeyFriendlyName
        self.http = http
    }

    private struct CreateKeyResponse: Decodable {
        let sid: String
        let secret: String
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard !accountSid.isEmpty else {
            throw ConnectorError.misconfigured("accountSid is required.")
        }
        let basic = Data("\(accountSid):\(adminCredential)".utf8).base64EncodedString()
        let headers = ["Authorization": "Basic \(basic)"]

        guard let createURL = URL(
            string: "\(Self.apiBase)/2010-04-01/Accounts/\(accountSid)/Keys.json") else {
            throw ConnectorError.misconfigured("Bad Twilio endpoint.")
        }
        let createRequest = try HTTPClient.makeRequest(
            method: "POST",
            url: createURL,
            headers: headers,
            formBody: ["FriendlyName": newKeyFriendlyName])
        let created: CreateKeyResponse
        do {
            created = try await http.sendJSON(CreateKeyResponse.self,
                                              request: createRequest,
                                              acceptedStatusCodes: 200...299)
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }

        if !oldKeySid.isEmpty,
           let deleteURL = URL(
            string: "\(Self.apiBase)/2010-04-01/Accounts/\(accountSid)/Keys/\(oldKeySid).json") {
            let deleteRequest = try? HTTPClient.makeRequest(method: "DELETE",
                                                            url: deleteURL,
                                                            headers: headers)
            if let deleteRequest {
                _ = try? await http.send(deleteRequest, acceptedStatusCodes: 200...299)
            }
        }

        // Twilio API keys authenticate as "sid:secret" — propagate the pair.
        return "\(created.sid):\(created.secret)"
    }
}

// MARK: - SendGrid

/// Rotates SendGrid API keys: creates a scoped key via
/// `POST /v3/api_keys`, then deletes the old one.
///
/// Admin credential: an API key with `api_keys.create` and
/// `api_keys.delete` scopes (or full access).
public struct SendGridConnector: SecretConnector {

    public static let connectorId = "sendgrid"

    public var id: String { Self.connectorId }
    public var displayName: String { "SendGrid" }
    public var capability: ConnectorCapability { .programmatic }

    /// Name for the new key.
    public var newKeyName: String
    /// Scopes granted to the new key, e.g. `["mail.send"]`.
    public var scopes: [String]
    /// Key id to delete after rotation.
    public var oldKeyId: String

    private let http: HTTPClient
    private static let apiBase = "https://api.sendgrid.com"

    public init(newKeyName: String = "topspin-rotated",
                scopes: [String] = ["mail.send"],
                oldKeyId: String = "",
                http: HTTPClient = HTTPClient()) {
        self.newKeyName = newKeyName
        self.scopes = scopes
        self.oldKeyId = oldKeyId
        self.http = http
    }

    private struct CreateKeyRequest: Encodable {
        let name: String
        let scopes: [String]
    }
    private struct CreateKeyResponse: Decodable {
        let api_key_id: String
        let api_key: String
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard adminCredential.hasPrefix("SG.") else {
            throw ConnectorError.invalidCredential("Expected a SendGrid API key (SG.…).")
        }
        let headers = ["Authorization": "Bearer \(adminCredential)"]

        guard let createURL = URL(string: "\(Self.apiBase)/v3/api_keys") else {
            throw ConnectorError.misconfigured("Bad SendGrid endpoint.")
        }
        let createRequest = try HTTPClient.makeRequest(
            method: "POST",
            url: createURL,
            headers: headers,
            jsonBody: CreateKeyRequest(name: newKeyName, scopes: scopes))
        let created: CreateKeyResponse
        do {
            created = try await http.sendJSON(CreateKeyResponse.self, request: createRequest)
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }

        if !oldKeyId.isEmpty,
           let deleteURL = URL(string: "\(Self.apiBase)/v3/api_keys/\(oldKeyId)") {
            let deleteRequest = try? HTTPClient.makeRequest(method: "DELETE",
                                                            url: deleteURL,
                                                            headers: headers)
            if let deleteRequest {
                _ = try? await http.send(deleteRequest)
            }
        }

        return created.api_key
    }
}

// MARK: - Slack (update-only)

/// Slack app-level tokens (`xoxb`, `xoxp`, `xapp`) are rotated in the app
/// management console (or via config-rotation APIs restricted to specific
/// token types). This connector is `updateOnly`.
public struct SlackConnector: SecretConnector {

    public static let connectorId = "slack"

    public var id: String { Self.connectorId }
    public var displayName: String { "Slack" }
    public var capability: ConnectorCapability { .updateOnly }

    /// Slack app id (`A…`), for display/routing purposes.
    public var appId: String?

    public init(appId: String? = nil) {
        self.appId = appId
    }

    public func rotate(adminCredential: String) async throws -> String {
        throw ConnectorError.manualRotationRequired(connectorId: id)
    }
}

// MARK: - npm

/// Rotates npm access tokens via the registry token API.
///
/// Capability is `partial`: granular tokens can be created via
/// `POST /-/npm/v1/tokens` where the registry supports it; legacy token
/// setups require basic auth + OTP and are effectively update-only.
///
/// Admin credential format:
/// - `basic:<username>:<password>` or `basic:<username>:<password>:<otp>`
/// - `bearer:<legacy-token>`
public struct NpmConnector: SecretConnector {

    public static let connectorId = "npm"

    public var id: String { Self.connectorId }
    public var displayName: String { "npm" }
    public var capability: ConnectorCapability { .partial }

    /// Registry base URL (self-hosted registries supported).
    public var registryUrl: String
    /// Name for the new token.
    public var newTokenName: String
    /// Key (uuid) of the token to delete after rotation.
    public var oldTokenKey: String
    /// Token lifetime in days (nil = registry default).
    public var expiresInDays: Int?

    private let http: HTTPClient

    public init(registryUrl: String = "https://registry.npmjs.org",
                newTokenName: String = "topspin-rotated",
                oldTokenKey: String = "",
                expiresInDays: Int? = nil,
                http: HTTPClient = HTTPClient()) {
        self.registryUrl = registryUrl
        self.newTokenName = newTokenName
        self.oldTokenKey = oldTokenKey
        self.expiresInDays = expiresInDays
        self.http = http
    }

    private struct CreateTokenRequest: Encodable {
        let name: String
        let type: String
        let expires: String?
    }
    private struct CreateTokenResponse: Decodable {
        let token: String
        let key: String?
    }

    public func rotate(adminCredential: String) async throws -> String {
        let (authHeaders, otp) = try Self.parseCredential(adminCredential)
        var headers = authHeaders
        if let otp { headers["npm-otp"] = otp }

        guard let createURL = URL(string: "\(registryUrl)/-/npm/v1/tokens") else {
            throw ConnectorError.misconfigured("Bad registry URL: \(registryUrl)")
        }
        var expires: String?
        if let expiresInDays {
            expires = ISO8601DateFormatter().string(
                from: Date().addingTimeInterval(TimeInterval(expiresInDays) * 86400))
        }
        let createRequest = try HTTPClient.makeRequest(
            method: "POST",
            url: createURL,
            headers: headers,
            jsonBody: CreateTokenRequest(name: newTokenName, type: "granular", expires: expires))
        let created: CreateTokenResponse
        do {
            created = try await http.sendJSON(CreateTokenResponse.self,
                                              request: createRequest,
                                              acceptedStatusCodes: 200...299)
        } catch let error as HTTPError {
            if case .unexpectedStatus(let code, _) = error, code == 401 {
                throw ConnectorError.invalidCredential(
                    "npm rejected the credential (401) — OTP required or invalid.")
            }
            throw ConnectorError.remote(error.description)
        }

        if !oldTokenKey.isEmpty,
           let deleteURL = URL(string: "\(registryUrl)/-/npm/v1/tokens/token/\(oldTokenKey)") {
            let deleteRequest = try? HTTPClient.makeRequest(method: "DELETE",
                                                            url: deleteURL,
                                                            headers: headers)
            if let deleteRequest {
                _ = try? await http.send(deleteRequest, acceptedStatusCodes: 200...299)
            }
        }

        return created.token
    }

    /// Parses the admin credential into auth headers (+ optional OTP).
    static func parseCredential(_ credential: String) throws -> ([String: String], String?) {
        let parts = credential.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        guard let scheme = parts.first else {
            throw ConnectorError.invalidCredential("Expected 'basic:user:pass[:otp]' or 'bearer:token'.")
        }
        switch scheme {
        case "bearer" where parts.count == 2:
            return (["Authorization": "Bearer \(parts[1])"], nil)
        case "basic" where parts.count == 3 || parts.count == 4:
            let basic = Data("\(parts[1]):\(parts[2])".utf8).base64EncodedString()
            return (["Authorization": "Basic \(basic)"], parts.count == 4 ? parts[3] : nil)
        default:
            throw ConnectorError.invalidCredential("Expected 'basic:user:pass[:otp]' or 'bearer:token'.")
        }
    }
}

// MARK: - Docker Hub

/// Rotates Docker Hub personal access tokens: logs in to obtain a JWT,
/// creates a new PAT via `POST /v2/access-tokens`, then deletes the old one.
///
/// Admin credential: `username:password` (or `username:currentPAT`).
public struct DockerHubConnector: SecretConnector {

    public static let connectorId = "dockerhub"

    public var id: String { Self.connectorId }
    public var displayName: String { "Docker Hub" }
    public var capability: ConnectorCapability { .programmatic }

    /// Label for the new token.
    public var newTokenLabel: String
    /// Scopes for the new token, e.g. `["repo:admin"]`.
    public var scopes: [String]
    /// UUID of the token to delete after rotation.
    public var oldTokenUUID: String

    private let http: HTTPClient
    private static let apiBase = "https://hub.docker.com"

    public init(newTokenLabel: String = "topspin-rotated",
                scopes: [String] = ["repo:admin"],
                oldTokenUUID: String = "",
                http: HTTPClient = HTTPClient()) {
        self.newTokenLabel = newTokenLabel
        self.scopes = scopes
        self.oldTokenUUID = oldTokenUUID
        self.http = http
    }

    private struct LoginRequest: Encodable {
        let username: String
        let password: String
    }
    private struct LoginResponse: Decodable {
        let token: String
    }
    private struct CreateTokenRequest: Encodable {
        let token_label: String
        let scopes: [String]
    }
    private struct CreateTokenResponse: Decodable {
        let uuid: String
        let token: String
    }

    public func rotate(adminCredential: String) async throws -> String {
        let (username, password) = try AWSIAMConnector.splitCredential(adminCredential)

        // 1. Log in → JWT.
        guard let loginURL = URL(string: "\(Self.apiBase)/v2/users/login") else {
            throw ConnectorError.misconfigured("Bad Docker Hub endpoint.")
        }
        let loginRequest = try HTTPClient.makeRequest(
            method: "POST", url: loginURL,
            jsonBody: LoginRequest(username: username, password: password))
        let jwt: String
        do {
            jwt = try await http.sendJSON(LoginResponse.self, request: loginRequest).token
        } catch let error as HTTPError {
            if case .unexpectedStatus(let code, _) = error, code == 401 {
                throw ConnectorError.invalidCredential("Docker Hub login failed (401).")
            }
            throw ConnectorError.remote(error.description)
        }

        // 2. Create the new PAT.
        guard let createURL = URL(string: "\(Self.apiBase)/v2/access-tokens") else {
            throw ConnectorError.misconfigured("Bad Docker Hub endpoint.")
        }
        let createRequest = try HTTPClient.makeRequest(
            method: "POST", url: createURL,
            headers: ["Authorization": "Bearer \(jwt)"],
            jsonBody: CreateTokenRequest(token_label: newTokenLabel, scopes: scopes))
        let created: CreateTokenResponse
        do {
            created = try await http.sendJSON(CreateTokenResponse.self, request: createRequest)
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }

        // 3. Delete the old PAT (best effort).
        if !oldTokenUUID.isEmpty,
           let deleteURL = URL(string: "\(Self.apiBase)/v2/access-tokens/\(oldTokenUUID)") {
            let deleteRequest = try? HTTPClient.makeRequest(
                method: "DELETE", url: deleteURL,
                headers: ["Authorization": "Bearer \(jwt)"])
            if let deleteRequest {
                _ = try? await http.send(deleteRequest)
            }
        }

        return created.token
    }
}

// MARK: - Kubernetes

/// Writes a generated secret value into a Kubernetes `Secret` via the API
/// server (merge-patch, with create fallback). Useful both as a rotation
/// source (random values) and as an alternative to file targets.
///
/// Admin credential: a bearer token allowed to read/write Secrets in the
/// configured namespace.
///
/// - Note: TLS is validated by URLSession. Clusters with self-signed API
///   certificates need a proper CA trust setup on the device; this connector
///   intentionally does not disable certificate validation.
public struct KubernetesConnector: SecretConnector {

    public static let connectorId = "kubernetes"

    public var id: String { Self.connectorId }
    public var displayName: String { "Kubernetes Secret" }
    public var capability: ConnectorCapability { .programmatic }

    /// API server base URL, e.g. `https://cluster.example:6443`.
    public var apiServer: String
    public var namespace: String
    /// Name of the `Secret` resource.
    public var secretName: String
    /// Key inside `data` that receives the new value.
    public var dataKey: String

    private let http: HTTPClient

    public init(apiServer: String,
                namespace: String,
                secretName: String,
                dataKey: String,
                http: HTTPClient = HTTPClient()) {
        self.apiServer = apiServer
        self.namespace = namespace
        self.secretName = secretName
        self.dataKey = dataKey
        self.http = http
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard !apiServer.isEmpty, !namespace.isEmpty, !secretName.isEmpty, !dataKey.isEmpty else {
            throw ConnectorError.misconfigured("apiServer, namespace, secretName and dataKey are required.")
        }
        let newValue = SecretGenerator.randomValue(length: 40)
        let base64Value = Data(newValue.utf8).base64EncodedString()
        guard let url = URL(
            string: "\(apiServer)/api/v1/namespaces/\(namespace)/secrets/\(secretName)") else {
            throw ConnectorError.misconfigured("Bad API server URL: \(apiServer)")
        }
        let headers = ["Authorization": "Bearer \(adminCredential)"]

        // Strategic merge patch only touches the one data key.
        let patchBody = "{\"data\":{\"\(dataKey)\":\"\(base64Value)\"}}"
        var patchRequest = URLRequest(url: url)
        patchRequest.httpMethod = "PATCH"
        patchRequest.setValue("application/merge-patch+json", forHTTPHeaderField: "Content-Type")
        for (name, value) in headers { patchRequest.setValue(value, forHTTPHeaderField: name) }
        patchRequest.httpBody = Data(patchBody.utf8)

        do {
            try await http.send(patchRequest)
        } catch let error as HTTPError {
            if case .unexpectedStatus(let code, _) = error, code == 404 {
                // Secret does not exist yet — create it.
                guard let createURL = URL(
                    string: "\(apiServer)/api/v1/namespaces/\(namespace)/secrets") else {
                    throw ConnectorError.misconfigured("Bad API server URL: \(apiServer)")
                }
                let createRequest = try HTTPClient.makeRequest(
                    method: "POST",
                    url: createURL,
                    headers: headers,
                    jsonBody: KubernetesSecretBody(
                        apiVersion: "v1", kind: "Secret",
                        metadata: .init(name: secretName),
                        type: "Opaque",
                        data: [dataKey: base64Value]))
                do {
                    try await http.send(createRequest, acceptedStatusCodes: 200...299)
                } catch let createError as HTTPError {
                    throw ConnectorError.remote(createError.description)
                }
            } else {
                throw ConnectorError.remote(error.description)
            }
        }

        return newValue
    }
}

/// Request body for creating a Kubernetes `Secret` (used by the 404
/// fallback in ``KubernetesConnector``).
private struct KubernetesSecretBody: Encodable {
    struct Metadata: Encodable { let name: String }
    let apiVersion: String
    let kind: String
    let metadata: Metadata
    let type: String
    let data: [String: String]
}

// MARK: - Infisical (source)

/// Uses Infisical as the rotation **source**: generates a fresh random value
/// locally and upserts it into the configured project/environment/path.
/// The returned value then flows to the other targets.
///
/// Admin credential: the Universal Auth **clientSecret** (clientId lives in
/// configuration). The clientSecret itself is stored only in the Keychain.
public struct InfisicalSourceConnector: SecretConnector {

    public static let connectorId = "infisical"

    public var id: String { Self.connectorId }
    public var displayName: String { "Infisical (source)" }
    public var capability: ConnectorCapability { .programmatic }

    /// Universal Auth client id (non-secret configuration).
    public var clientId: String
    public var workspaceId: String
    public var environment: String
    public var secretPath: String
    /// Name of the secret inside Infisical.
    public var secretName: String
    /// Infisical base URL (self-hosted supported).
    public var baseUrl: URL
    /// Length of the generated value.
    public var valueLength: Int

    public init(clientId: String,
                workspaceId: String,
                environment: String,
                secretPath: String = "/",
                secretName: String,
                baseUrl: URL = URL(string: "https://app.infisical.com")!,
                valueLength: Int = 40) {
        self.clientId = clientId
        self.workspaceId = workspaceId
        self.environment = environment
        self.secretPath = secretPath
        self.secretName = secretName
        self.baseUrl = baseUrl
        self.valueLength = valueLength
    }

    public func rotate(adminCredential: String) async throws -> String {
        let client = InfisicalClient(baseUrl: baseUrl)
        let authed: InfisicalClient
        do {
            authed = try await client.authenticate(clientId: clientId, clientSecret: adminCredential)
        } catch let error as InfisicalError {
            throw ConnectorError.invalidCredential(error.description)
        }
        let newValue = SecretGenerator.randomValue(length: max(16, valueLength))
        do {
            try await authed.upsertSecret(name: secretName,
                                          value: newValue,
                                          workspaceId: workspaceId,
                                          environment: environment,
                                          secretPath: secretPath)
        } catch let error as InfisicalError {
            throw ConnectorError.remote(error.description)
        }
        return newValue
    }
}

// MARK: - Generic REST

/// Fully configurable connector for Doppler-style platforms and in-house
/// rotation endpoints.
///
/// The request template may reference two placeholders, substituted at
/// rotation time:
/// - `{{adminCredential}}` — the admin credential passed by the engine.
/// - `{{generatedValue}}` — a fresh random value generated locally.
///
/// If ``responseValueJSONPath`` is non-empty, the new secret is extracted
/// from the JSON response at that dot-separated path (e.g.
/// `data.token`); otherwise the generated value itself is the secret.
public struct GenericRESTConnector: SecretConnector {

    public static let connectorId = "generic.rest"

    public var id: String { Self.connectorId }
    public var displayName: String { "Generic REST" }
    public var capability: ConnectorCapability { .programmatic }

    /// Request URL template, e.g. `https://api.doppler.com/v3/configs/config/secrets`.
    public var urlTemplate: String
    /// HTTP method, e.g. `POST`, `PUT`.
    public var method: String
    /// Header templates; values may contain placeholders.
    public var headerTemplates: [String: String]
    /// Body template (sent as raw UTF-8 with content-type header from
    /// ``headerTemplates``). May contain placeholders. Empty = no body.
    public var bodyTemplate: String
    /// Dot-separated JSON path into the response for the new value.
    public var responseValueJSONPath: String
    /// Length of the locally generated value.
    public var generatedValueLength: Int

    private let http: HTTPClient

    public init(urlTemplate: String,
                method: String = "POST",
                headerTemplates: [String: String] = [
                    "Authorization": "Bearer {{adminCredential}}",
                    "Content-Type": "application/json"
                ],
                bodyTemplate: String = "{\"value\": \"{{generatedValue}}\"}",
                responseValueJSONPath: String = "",
                generatedValueLength: Int = 40,
                http: HTTPClient = HTTPClient()) {
        self.urlTemplate = urlTemplate
        self.method = method
        self.headerTemplates = headerTemplates
        self.bodyTemplate = bodyTemplate
        self.responseValueJSONPath = responseValueJSONPath
        self.generatedValueLength = generatedValueLength
        self.http = http
    }

    public func rotate(adminCredential: String) async throws -> String {
        let generated = SecretGenerator.randomValue(length: max(8, generatedValueLength))

        func substitute(_ template: String) -> String {
            template
                .replacingOccurrences(of: "{{adminCredential}}", with: adminCredential)
                .replacingOccurrences(of: "{{generatedValue}}", with: generated)
        }

        guard let url = URL(string: substitute(urlTemplate)) else {
            throw ConnectorError.misconfigured("URL template produced an invalid URL.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method.uppercased()
        for (name, template) in headerTemplates {
            request.setValue(substitute(template), forHTTPHeaderField: name)
        }
        if !bodyTemplate.isEmpty {
            request.httpBody = Data(substitute(bodyTemplate).utf8)
        }

        let response: HTTPClient.Response
        do {
            response = try await http.send(request)
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }

        guard !responseValueJSONPath.isEmpty else {
            return generated
        }
        guard let extracted = Self.extract(responseValueJSONPath, from: response.data),
              !extracted.isEmpty else {
            throw ConnectorError.unexpectedResponse(
                "Response did not contain a value at '\(responseValueJSONPath)'.")
        }
        return extracted
    }

    /// Extracts a string at a dot-separated JSON path using Foundation only.
    static func extract(_ path: String, from data: Data) -> String? {
        guard let root = try? JSONSerialization.jsonObject(with: data) else { return nil }
        var current: Any = root
        for component in path.split(separator: ".").map(String.init) {
            if let dict = current as? [String: Any], let next = dict[component] {
                current = next
            } else if let array = current as? [Any], let index = Int(component),
                      array.indices.contains(index) {
                current = array[index]
            } else {
                return nil
            }
        }
        return current as? String
    }
}
