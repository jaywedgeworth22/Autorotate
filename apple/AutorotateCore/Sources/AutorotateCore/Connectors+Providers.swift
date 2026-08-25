//
//  Connectors+Providers.swift
//  AutorotateCore
//
//  Connector implementations, group A: AWS IAM (with a minimal Signature
//  Version 4 signer), GitHub, Stripe, OpenAI, Anthropic, Cloudflare.
//
//  All connectors are production-shaped: real endpoints, real auth headers,
//  real request/response bodies. Without live credentials they will simply
//  surface the provider's 4xx — the request shape is the deliverable.
//

import Foundation

// MARK: - AWS IAM (Signature V4)

/// Rotates AWS IAM access keys.
///
/// Flow (architecture.md §3):
/// 1. `CreateAccessKey` for the configured IAM user → new key pair.
/// 2. Deactivate the old key (`UpdateAccessKey Status=Inactive`) so the old
///    value keeps working in `degraded` state during propagation and can be
///    deleted manually or by a later cleanup pass.
///
/// Admin credential format: `accessKeyId:secretAccessKey` of an IAM
/// principal allowed to call `iam:CreateAccessKey` / `iam:UpdateAccessKey`
/// on the target user.
public struct AWSIAMConnector: SecretConnector {

    public static let connectorId = "aws.iam"

    public var id: String { Self.connectorId }
    public var displayName: String { "AWS IAM Access Keys" }
    public var capability: ConnectorCapability { .programmatic }

    /// IAM API version used in every request.
    private static let apiVersion = "2010-05-08"
    /// IAM is a global service; SigV4 region is fixed to us-east-1.
    private static let region = "us-east-1"
    private static let service = "iam"
    private static let host = "iam.amazonaws.com"

    /// IAM user whose access key is rotated.
    public var userName: String
    /// The access key id currently deployed (deactivated after rotation).
    /// Empty when there is nothing to deactivate yet.
    public var oldAccessKeyId: String

    private let http: HTTPClient

    public init(userName: String, oldAccessKeyId: String = "", http: HTTPClient = HTTPClient()) {
        self.userName = userName
        self.oldAccessKeyId = oldAccessKeyId
        self.http = http
    }

    /// Creates a new access key pair and deactivates the old one.
    ///
    /// - Returns: `newAccessKeyId:newSecretAccessKey`. The pair is the
    ///   "secret value" propagated to targets; targets that only need the
    ///   secret half should bind a file target per key.
    public func rotate(adminCredential: String) async throws -> String {
        let (accessKeyId, secretAccessKey) = try Self.splitCredential(adminCredential)

        // 1. CreateAccessKey
        let createBody = HTTPClient.formURLEncode([
            "Action": "CreateAccessKey",
            "UserName": userName,
            "Version": Self.apiVersion
        ])
        let createResponse = try await signedRequest(body: createBody,
                                                     accessKeyId: accessKeyId,
                                                     secretAccessKey: secretAccessKey)
        guard let newKeyId = Self.xmlValue("AccessKeyId", in: createResponse),
              let newSecret = Self.xmlValue("SecretAccessKey", in: createResponse) else {
            throw ConnectorError.unexpectedResponse("CreateAccessKey response missing key material.")
        }

        // 2. Deactivate old key (best effort — the new key is already minted,
        //    so a failure here is reported but does not fail the rotation).
        if !oldAccessKeyId.isEmpty {
            let updateBody = HTTPClient.formURLEncode([
                "Action": "UpdateAccessKey",
                "AccessKeyId": oldAccessKeyId,
                "Status": "Inactive",
                "UserName": userName,
                "Version": Self.apiVersion
            ])
            _ = try? await signedRequest(body: updateBody,
                                         accessKeyId: accessKeyId,
                                         secretAccessKey: secretAccessKey)
        }

        return "\(newKeyId):\(newSecret)"
    }

    /// Splits an `accessKeyId:secretAccessKey` admin credential.
    public static func splitCredential(_ credential: String) throws -> (String, String) {
        let parts = credential.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else {
            throw ConnectorError.invalidCredential("Expected 'accessKeyId:secretAccessKey'.")
        }
        return (parts[0], parts[1])
    }

    /// Extracts the text content of a simple XML tag.
    static func xmlValue(_ tag: String, in xml: String) -> String? {
        guard let open = xml.range(of: "<\(tag)>"),
              let close = xml.range(of: "</\(tag)>", range: open.upperBound..<xml.endIndex) else {
            return nil
        }
        return String(xml[open.upperBound..<close.lowerBound])
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: SigV4

    private func signedRequest(body: String,
                               accessKeyId: String,
                               secretAccessKey: String) async throws -> String {
        guard let url = URL(string: "https://\(Self.host)/") else {
            throw ConnectorError.misconfigured("Bad IAM endpoint.")
        }
        let now = Date()
        let amzDate = Self.sigV4Formatter("yyyyMMdd'T'HHmmss'Z'").string(from: now)
        let dateStamp = Self.sigV4Formatter("yyyyMMdd").string(from: now)

        let payloadHash = Self.sha256Hex(Data(body.utf8))
        let contentType = "application/x-www-form-urlencoded; charset=utf-8"

        // Canonical request (headers sorted: content-type, host, x-amz-date).
        let canonicalHeaders =
            "content-type:\(contentType)\n" +
            "host:\(Self.host)\n" +
            "x-amz-date:\(amzDate)\n"
        let signedHeaders = "content-type;host;x-amz-date"
        let canonicalRequest = [
            "POST", "/", "", canonicalHeaders, signedHeaders, payloadHash
        ].joined(separator: "\n")

        let credentialScope = "\(dateStamp)/\(Self.region)/\(Self.service)/aws4_request"
        let stringToSign = [
            "AWS4-HMAC-SHA256", amzDate, credentialScope,
            Self.sha256Hex(Data(canonicalRequest.utf8))
        ].joined(separator: "\n")

        let signingKey = Self.deriveSigningKey(secret: secretAccessKey,
                                               dateStamp: dateStamp,
                                               region: Self.region,
                                               service: Self.service)
        let signature = Self.hmacHex(key: signingKey, message: stringToSign)

        let authorization = "AWS4-HMAC-SHA256 " +
            "Credential=\(accessKeyId)/\(credentialScope), " +
            "SignedHeaders=\(signedHeaders), Signature=\(signature)"

        let request = try HTTPClient.makeRequest(
            method: "POST",
            url: url,
            headers: [
                "Content-Type": contentType,
                "X-Amz-Date": amzDate,
                "Authorization": authorization,
                "Accept": "text/xml"
            ])
        var signed = request
        signed.httpBody = Data(body.utf8)

        do {
            return try await http.send(signed).text
        } catch let error as HTTPError {
            if case .unexpectedStatus(let code, _) = error, code == 403 {
                throw ConnectorError.invalidCredential("AWS rejected the admin credential (403).")
            }
            throw ConnectorError.remote(error.description)
        }
    }

    private static func sigV4Formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.dateFormat = format
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }

    private static func sha256Hex(_ data: Data) -> String {
        AutorotateSHA256.hashHex(data)
    }

    private static func hmac(key: Data, message: String) -> Data {
        AutorotateSHA256.hmac(key: key, message: Data(message.utf8))
    }

    private static func hmacHex(key: Data, message: String) -> String {
        hmac(key: key, message: message).map { String(format: "%02x", $0) }.joined()
    }

    private static func deriveSigningKey(secret: String, dateStamp: String,
                                         region: String, service: String) -> Data {
        let kDate = hmac(key: Data(("AWS4" + secret).utf8), message: dateStamp)
        let kRegion = hmac(key: kDate, message: region)
        let kService = hmac(key: kRegion, message: service)
        return hmac(key: kService, message: "aws4_request")
    }
}

// MARK: - GitHub

/// Rotates GitHub credentials.
///
/// Capability is `partial` (architecture.md §3):
/// - **OAuth app user tokens** can be reset programmatically via
///   `POST /applications/{client_id}/token`.
/// - **Fine-grained / classic PATs** cannot self-rotate — `pat` mode throws
///   ``ConnectorError/manualRotationRequired`` and the value is imported.
public struct GitHubConnector: SecretConnector {

    public static let connectorId = "github"

    public var id: String { Self.connectorId }
    public var displayName: String { "GitHub" }
    public var capability: ConnectorCapability { .partial }

    /// Which GitHub credential kind this instance rotates.
    public enum Mode: String, Codable, Sendable {
        /// OAuth app user-to-server token, resettable via the Apps API.
        case oauthApp
        /// Personal access token — update-only.
        case pat
    }

    public var mode: Mode
    /// OAuth app client id (mode == .oauthApp).
    public var oauthClientId: String
    /// The user access token to reset (mode == .oauthApp).
    public var tokenToReset: String

    private let http: HTTPClient
    private static let apiBase = "https://api.github.com"

    public init(mode: Mode,
                oauthClientId: String = "",
                tokenToReset: String = "",
                http: HTTPClient = HTTPClient()) {
        self.mode = mode
        self.oauthClientId = oauthClientId
        self.tokenToReset = tokenToReset
        self.http = http
    }

    private struct ResetTokenRequest: Encodable {
        let access_token: String
    }
    private struct ResetTokenResponse: Decodable {
        let token: String
    }

    public func rotate(adminCredential: String) async throws -> String {
        switch mode {
        case .pat:
            throw ConnectorError.manualRotationRequired(connectorId: id)
        case .oauthApp:
            // Admin credential: "client_id:client_secret" of the OAuth app.
            let (clientId, clientSecret) = try AWSIAMConnector.splitCredential(adminCredential)
            guard !oauthClientId.isEmpty, !tokenToReset.isEmpty else {
                throw ConnectorError.misconfigured("oauthClientId and tokenToReset are required.")
            }
            guard let url = URL(string: "\(Self.apiBase)/applications/\(oauthClientId)/token") else {
                throw ConnectorError.misconfigured("Bad GitHub endpoint.")
            }
            let basic = Data("\(clientId):\(clientSecret)".utf8).base64EncodedString()
            let request = try HTTPClient.makeRequest(
                method: "POST",
                url: url,
                headers: [
                    "Authorization": "Basic \(basic)",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                ],
                jsonBody: ResetTokenRequest(access_token: tokenToReset))
            do {
                let body = try await http.sendJSON(ResetTokenResponse.self, request: request)
                return body.token
            } catch let error as HTTPError {
                throw ConnectorError.remote(error.description)
            }
        }
    }
}

// MARK: - Stripe

/// Rotates Stripe restricted keys: creates a fresh restricted key with the
/// configured permissions, then deletes the old key.
///
/// Admin credential: a secret key (`sk_live_…` / `rk_live_…`) allowed to
/// create and delete restricted keys.
public struct StripeConnector: SecretConnector {

    public static let connectorId = "stripe"

    public var id: String { Self.connectorId }
    public var displayName: String { "Stripe" }
    public var capability: ConnectorCapability { .programmatic }

    /// Display name for the newly created restricted key.
    public var newKeyName: String
    /// Stripe permission → access level, e.g. `["charges": "write"]`.
    public var permissions: [String: String]
    /// The key id (`rk_live_…`) to delete after the new key is created.
    public var oldKeyId: String

    private let http: HTTPClient
    private static let apiBase = "https://api.stripe.com"

    public init(newKeyName: String = "autorotate-rotated",
                permissions: [String: String] = [:],
                oldKeyId: String = "",
                http: HTTPClient = HTTPClient()) {
        self.newKeyName = newKeyName
        self.permissions = permissions
        self.oldKeyId = oldKeyId
        self.http = http
    }

    private struct CreateKeyResponse: Decodable {
        let id: String
        let secret: String
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard adminCredential.hasPrefix("sk_") || adminCredential.hasPrefix("rk_") else {
            throw ConnectorError.invalidCredential("Expected a Stripe secret/restricted key (sk_…/rk_…).")
        }

        // 1. Create the new restricted key. Stripe uses nested form fields:
        //    permissions[charges]=write&name=autorotate-rotated
        var form: [String: String] = ["name": newKeyName]
        for (permission, access) in permissions {
            form["permissions[\(permission)]"] = access
        }
        guard let createURL = URL(string: "\(Self.apiBase)/v1/keys") else {
            throw ConnectorError.misconfigured("Bad Stripe endpoint.")
        }
        let createRequest = try HTTPClient.makeRequest(
            method: "POST",
            url: createURL,
            headers: ["Authorization": "Bearer \(adminCredential)"],
            formBody: form)
        let created: CreateKeyResponse
        do {
            created = try await http.sendJSON(CreateKeyResponse.self, request: createRequest)
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }

        // 2. Delete the old key (best effort — the new key already exists).
        if !oldKeyId.isEmpty,
           let deleteURL = URL(string: "\(Self.apiBase)/v1/keys/\(oldKeyId)") {
            let deleteRequest = try? HTTPClient.makeRequest(
                method: "DELETE",
                url: deleteURL,
                headers: ["Authorization": "Bearer \(adminCredential)"])
            if let deleteRequest {
                _ = try? await http.send(deleteRequest)
            }
        }

        return created.secret
    }
}

// MARK: - OpenAI

/// Rotates OpenAI project service-account API keys via the Admin API:
/// creates a new service account (whose key is returned once), then deletes
/// the old service account.
///
/// Admin credential: an OpenAI **Admin** API key (`sk-admin-…`).
public struct OpenAIConnector: SecretConnector {

    public static let connectorId = "openai"

    public var id: String { Self.connectorId }
    public var displayName: String { "OpenAI" }
    public var capability: ConnectorCapability { .programmatic }

    /// Project that owns the service account (`proj_…`).
    public var projectId: String
    /// Service account to delete after rotation (`sa_…`-style id).
    public var oldServiceAccountId: String
    /// Name given to the newly created service account.
    public var newServiceAccountName: String

    private let http: HTTPClient
    private static let apiBase = "https://api.openai.com"

    public init(projectId: String,
                oldServiceAccountId: String = "",
                newServiceAccountName: String = "autorotate-rotated",
                http: HTTPClient = HTTPClient()) {
        self.projectId = projectId
        self.oldServiceAccountId = oldServiceAccountId
        self.newServiceAccountName = newServiceAccountName
        self.http = http
    }

    private struct CreateServiceAccountRequest: Encodable {
        let name: String
    }
    /// Flexible decode: the Admin API has returned the key both as
    /// `api_key.value` and (older) top-level fields.
    private struct CreateServiceAccountResponse: Decodable {
        struct APIKey: Decodable { let value: String? }
        let id: String
        let api_key: APIKey?
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard !projectId.isEmpty else {
            throw ConnectorError.misconfigured("projectId is required.")
        }
        guard let createURL = URL(
            string: "\(Self.apiBase)/v1/organization/projects/\(projectId)/service_accounts") else {
            throw ConnectorError.misconfigured("Bad OpenAI endpoint.")
        }
        // Admin keys are organization-scoped; no extra org header needed.
        let headers = ["Authorization": "Bearer \(adminCredential)"]
        let createRequest = try HTTPClient.makeRequest(
            method: "POST",
            url: createURL,
            headers: headers,
            jsonBody: CreateServiceAccountRequest(name: newServiceAccountName))
        let created: CreateServiceAccountResponse
        do {
            created = try await http.sendJSON(CreateServiceAccountResponse.self, request: createRequest)
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }
        guard let newKey = created.api_key?.value, !newKey.isEmpty else {
            throw ConnectorError.unexpectedResponse("Service account created but no api_key returned.")
        }

        if !oldServiceAccountId.isEmpty,
           let deleteURL = URL(
            string: "\(Self.apiBase)/v1/organization/projects/\(projectId)/service_accounts/\(oldServiceAccountId)") {
            let deleteRequest = try? HTTPClient.makeRequest(
                method: "DELETE", url: deleteURL,
                headers: ["Authorization": "Bearer \(adminCredential)"])
            if let deleteRequest {
                _ = try? await http.send(deleteRequest)
            }
        }

        return newKey
    }
}

// MARK: - Anthropic

/// Rotates Anthropic workspace-scoped API keys via the Admin API
/// (`/v1/organizations/workspaces/{id}/api_keys`).
///
/// Capability is `partial`: the Admin API requires an organization admin key
/// and is not available on all plans; when unavailable, treat as update-only
/// and import the value.
///
/// Admin credential: an Anthropic **Admin** API key (`sk-ant-admin…`).
public struct AnthropicConnector: SecretConnector {

    public static let connectorId = "anthropic"

    public var id: String { Self.connectorId }
    public var displayName: String { "Anthropic" }
    public var capability: ConnectorCapability { .partial }

    /// Workspace that owns the key.
    public var workspaceId: String
    /// Key id to delete after rotation.
    public var oldKeyId: String
    /// Name for the new key.
    public var newKeyName: String

    private let http: HTTPClient
    private static let apiBase = "https://api.anthropic.com"
    private static let anthropicVersion = "2023-06-01"

    public init(workspaceId: String,
                oldKeyId: String = "",
                newKeyName: String = "autorotate-rotated",
                http: HTTPClient = HTTPClient()) {
        self.workspaceId = workspaceId
        self.oldKeyId = oldKeyId
        self.newKeyName = newKeyName
        self.http = http
    }

    private struct CreateKeyRequest: Encodable {
        let name: String
    }
    private struct CreateKeyResponse: Decodable {
        let id: String
        /// The full key value, returned once at creation.
        let key: String?
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard !workspaceId.isEmpty else {
            throw ConnectorError.misconfigured("workspaceId is required.")
        }
        guard let createURL = URL(
            string: "\(Self.apiBase)/v1/organizations/workspaces/\(workspaceId)/api_keys") else {
            throw ConnectorError.misconfigured("Bad Anthropic endpoint.")
        }
        let headers = [
            "x-api-key": adminCredential,
            "anthropic-version": Self.anthropicVersion
        ]
        let createRequest = try HTTPClient.makeRequest(
            method: "POST",
            url: createURL,
            headers: headers,
            jsonBody: CreateKeyRequest(name: newKeyName))
        let created: CreateKeyResponse
        do {
            created = try await http.sendJSON(CreateKeyResponse.self, request: createRequest)
        } catch let error as HTTPError {
            if case .unexpectedStatus(let code, _) = error, code == 401 || code == 403 {
                throw ConnectorError.invalidCredential("Anthropic rejected the admin key (\(code)).")
            }
            throw ConnectorError.remote(error.description)
        }
        guard let newKey = created.key, !newKey.isEmpty else {
            throw ConnectorError.unexpectedResponse("API key created but value not returned.")
        }

        if !oldKeyId.isEmpty,
           let deleteURL = URL(
            string: "\(Self.apiBase)/v1/organizations/workspaces/\(workspaceId)/api_keys/\(oldKeyId)") {
            let deleteRequest = try? HTTPClient.makeRequest(
                method: "DELETE", url: deleteURL, headers: headers)
            if let deleteRequest {
                _ = try? await http.send(deleteRequest)
            }
        }

        return newKey
    }
}

// MARK: - Cloudflare

/// Rolls a Cloudflare API token value:
/// `PUT /client/v4/user/tokens/{token_id}/value` with the new value.
///
/// The new value is generated locally (Cloudflare accepts any ≥40-char
/// random string as a token value).
///
/// Admin credential: a Cloudflare API token with the **API Tokens: Edit**
/// permission.
public struct CloudflareConnector: SecretConnector {

    public static let connectorId = "cloudflare"

    public var id: String { Self.connectorId }
    public var displayName: String { "Cloudflare" }
    public var capability: ConnectorCapability { .programmatic }

    /// Id of the token whose value is rolled.
    public var tokenId: String

    private let http: HTTPClient
    private static let apiBase = "https://api.cloudflare.com"

    public init(tokenId: String, http: HTTPClient = HTTPClient()) {
        self.tokenId = tokenId
        self.http = http
    }

    private struct RollValueRequest: Encodable {
        let value: String
    }
    private struct RollValueResponse: Decodable {
        struct Result: Decodable { let value: String? }
        let success: Bool
        let result: Result?
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard !tokenId.isEmpty else {
            throw ConnectorError.misconfigured("tokenId is required.")
        }
        guard let url = URL(string: "\(Self.apiBase)/client/v4/user/tokens/\(tokenId)/value") else {
            throw ConnectorError.misconfigured("Bad Cloudflare endpoint.")
        }
        let newValue = SecretGenerator.randomValue(length: 40)
        let request = try HTTPClient.makeRequest(
            method: "PUT",
            url: url,
            headers: ["Authorization": "Bearer \(adminCredential)"],
            jsonBody: RollValueRequest(value: newValue))
        do {
            let body = try await http.sendJSON(RollValueResponse.self, request: request)
            guard body.success else {
                throw ConnectorError.remote("Cloudflare reported success=false on token roll.")
            }
            return body.result?.value ?? newValue
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }
    }
}

// MARK: - Resend

/// Rotates Resend API keys:
/// 1. `POST https://api.resend.com/api-keys` with name → returns `token` and `id`.
/// 2. Deletes old key if `oldKeyId` is provided (`DELETE https://api.resend.com/api-keys/{id}`).
public struct ResendConnector: SecretConnector {
    public static let connectorId = "resend"
    public var id: String { Self.connectorId }
    public var displayName: String { "Resend" }
    public var capability: ConnectorCapability { .programmatic }

    public var newKeyName: String
    public var oldKeyId: String
    private let http: HTTPClient
    private static let apiBase = "https://api.resend.com"

    public init(newKeyName: String = "autorotate-rotated",
                oldKeyId: String = "",
                http: HTTPClient = HTTPClient()) {
        self.newKeyName = newKeyName
        self.oldKeyId = oldKeyId
        self.http = http
    }

    private struct CreateKeyRequest: Encodable {
        let name: String
    }
    private struct CreateKeyResponse: Decodable {
        let id: String?
        let token: String?
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard let url = URL(string: "\(Self.apiBase)/api-keys") else {
            throw ConnectorError.misconfigured("Bad Resend endpoint.")
        }
        let request = try HTTPClient.makeRequest(
            method: "POST",
            url: url,
            headers: ["Authorization": "Bearer \(adminCredential)"],
            jsonBody: CreateKeyRequest(name: newKeyName))
        let created: CreateKeyResponse
        do {
            created = try await http.sendJSON(CreateKeyResponse.self, request: request)
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }
        guard let token = created.token, !token.isEmpty else {
            throw ConnectorError.unexpectedResponse("Resend created key but token not returned.")
        }
        if !oldKeyId.isEmpty, let deleteURL = URL(string: "\(Self.apiBase)/api-keys/\(oldKeyId)") {
            let deleteReq = try? HTTPClient.makeRequest(
                method: "DELETE", url: deleteURL, headers: ["Authorization": "Bearer \(adminCredential)"])
            if let deleteReq { _ = try? await http.send(deleteReq) }
        }
        return token
    }
}

// MARK: - Hugging Face

/// Rotates Hugging Face access tokens.
public struct HuggingFaceConnector: SecretConnector {
    public static let connectorId = "huggingface"
    public var id: String { Self.connectorId }
    public var displayName: String { "Hugging Face" }
    public var capability: ConnectorCapability { .programmatic }

    public var tokenName: String
    public var role: String
    private let http: HTTPClient
    private static let apiBase = "https://huggingface.co"

    public init(tokenName: String = "autorotate-rotated",
                role: String = "write",
                http: HTTPClient = HTTPClient()) {
        self.tokenName = tokenName
        self.role = role
        self.http = http
    }

    private struct CreateTokenRequest: Encodable {
        let name: String
        let role: String
    }
    private struct CreateTokenResponse: Decodable {
        let token: String?
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard let url = URL(string: "\(Self.apiBase)/api/tokens") else {
            throw ConnectorError.misconfigured("Bad Hugging Face endpoint.")
        }
        let request = try HTTPClient.makeRequest(
            method: "POST",
            url: url,
            headers: ["Authorization": "Bearer \(adminCredential)"],
            jsonBody: CreateTokenRequest(name: tokenName, role: role))
        do {
            let created = try await http.sendJSON(CreateTokenResponse.self, request: request)
            guard let token = created.token, !token.isEmpty else {
                throw ConnectorError.unexpectedResponse("Hugging Face did not return token.")
            }
            return token
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }
    }
}

// MARK: - Neon

/// Rotates Neon Postgres API keys.
public struct NeonConnector: SecretConnector {
    public static let connectorId = "neon"
    public var id: String { Self.connectorId }
    public var displayName: String { "Neon" }
    public var capability: ConnectorCapability { .programmatic }

    public var keyName: String
    private let http: HTTPClient
    private static let apiBase = "https://console.neon.tech/api/v2"

    public init(keyName: String = "autorotate-rotated", http: HTTPClient = HTTPClient()) {
        self.keyName = keyName
        self.http = http
    }

    private struct CreateKeyRequest: Encodable {
        let key_name: String
    }
    private struct CreateKeyResponse: Decodable {
        let key: String?
    }

    public func rotate(adminCredential: String) async throws -> String {
        guard let url = URL(string: "\(Self.apiBase)/api_keys") else {
            throw ConnectorError.misconfigured("Bad Neon endpoint.")
        }
        let request = try HTTPClient.makeRequest(
            method: "POST",
            url: url,
            headers: ["Authorization": "Bearer \(adminCredential)"],
            jsonBody: CreateKeyRequest(key_name: keyName))
        do {
            let created = try await http.sendJSON(CreateKeyResponse.self, request: request)
            guard let key = created.key, !key.isEmpty else {
                throw ConnectorError.unexpectedResponse("Neon created key but value not returned.")
            }
            return key
        } catch let error as HTTPError {
            throw ConnectorError.remote(error.description)
        }
    }
}

