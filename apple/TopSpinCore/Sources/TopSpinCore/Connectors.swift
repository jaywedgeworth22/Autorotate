//
//  Connectors.swift
//  TopSpinCore
//
//  Connector protocol, error types, and the registry of all supported
//  platforms (capability matrix: architecture.md §3).
//
//  A connector knows how to rotate ONE credential at ONE platform using a
//  user-supplied admin credential. Connectors never persist anything: the
//  admin credential is fetched from the Keychain (native) by the engine and
//  passed in-memory; the newly rotated value is returned in-memory to the
//  engine, which pushes it to targets.
//

import Foundation

// MARK: - Connector protocol

/// Adapter for one secret platform (AWS IAM, GitHub, Stripe, …).
///
/// Implementations must be value types or otherwise `Sendable`; the engine
/// may call them concurrently for different secrets.
public protocol SecretConnector: Sendable {
    /// Stable identifier, e.g. `aws.iam`. Used by `SecretRecord.connectorId`.
    var id: String { get }
    /// Human-readable name shown in the UI, e.g. `AWS IAM Access Keys`.
    var displayName: String { get }
    /// Rotation capability of the underlying platform.
    var capability: ConnectorCapability { get }

    /// Programmatically rotate the credential.
    ///
    /// - Parameter adminCredential: Admin-level credential for the platform
    ///   (API key, session token, `accessKeyId:secretAccessKey` pair, …),
    ///   supplied in-memory by the engine from the credential store.
    /// - Returns: The **new** secret value. Exists only in memory.
    /// - Throws: ``ConnectorError/manualRotationRequired`` when the connector
    ///   is `updateOnly` (or a `partial` connector in a non-programmatic
    ///   configuration), ``ConnectorError/remote(_:)`` for provider
    ///   failures.
    func rotate(adminCredential: String) async throws -> String

    /// Accepts a value that the user rotated manually in the provider's UI.
    ///
    /// Default implementation: allowed only for `updateOnly`/`partial`
    /// connectors, validates non-empty, returns the value unchanged so the
    /// engine can fingerprint and propagate it.
    func validateImportedValue(_ newValue: String, adminCredential: String) async throws -> String
}

public extension SecretConnector {
    /// Default import validation for manual rotations.
    func validateImportedValue(_ newValue: String, adminCredential: String) async throws -> String {
        guard capability != .programmatic else {
            throw ConnectorError.importNotSupported(id: id)
        }
        let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw ConnectorError.invalidCredential("Imported value is empty.")
        }
        return trimmed
    }
}

// MARK: - Connector errors

/// Errors thrown by connectors. `remote` messages are already sanitized by
/// the HTTP layer (truncated response excerpts, never request bodies).
public enum ConnectorError: Error, Sendable, CustomStringConvertible {
    /// The platform cannot rotate programmatically; the user must import a
    /// value rotated in the provider UI.
    case manualRotationRequired(connectorId: String)
    /// `validateImportedValue` was called on a programmatic connector.
    case importNotSupported(id: String)
    /// The admin credential is missing, malformed, or rejected.
    case invalidCredential(String)
    /// Required connector configuration is missing or malformed.
    case misconfigured(String)
    /// The provider API call failed. Associated string is sanitized.
    case remote(String)
    /// The provider response did not contain the expected fields.
    case unexpectedResponse(String)

    public var description: String {
        switch self {
        case .manualRotationRequired(let id):
            return "\(id) is update-only: rotate in the provider UI, then import the new value."
        case .importNotSupported(let id):
            return "\(id) rotates programmatically; importing a manual value is not supported."
        case .invalidCredential(let m): return "Invalid credential: \(m)"
        case .misconfigured(let m):     return "Misconfigured connector: \(m)"
        case .remote(let m):            return "Provider error: \(m)"
        case .unexpectedResponse(let m): return "Unexpected provider response: \(m)"
        }
    }
}

// MARK: - Registry

/// Static metadata about a connector kind, used to build picker UIs without
/// instantiating a connector (which requires configuration).
public struct ConnectorDescriptor: Codable, Sendable, Identifiable {
    /// Connector id, e.g. `aws.iam`.
    public var id: String
    /// Human-readable name.
    public var displayName: String
    /// Rotation capability.
    public var capability: ConnectorCapability
    /// Short description of the rotation mechanism (architecture.md §3).
    public var mechanism: String
    /// What the "admin credential" is for this platform — shown next to the
    /// credential input in the UI.
    public var adminCredentialHint: String

    public init(id: String, displayName: String, capability: ConnectorCapability,
                mechanism: String, adminCredentialHint: String) {
        self.id = id
        self.displayName = displayName
        self.capability = capability
        self.mechanism = mechanism
        self.adminCredentialHint = adminCredentialHint
    }
}

/// Registry of every connector shipped with TopSpin.
///
/// The registry stores **descriptors** (metadata). Connectors themselves are
/// instantiated per-secret by the app from the persisted connector
/// configuration, because each instance carries platform-specific config
/// (account ids, project ids, …).
public enum ConnectorRegistry {

    /// Dedicated live connector types shipped with TopSpinCore.
    public static let shipped: [ConnectorDescriptor] = [
        ConnectorDescriptor(
            id: InfisicalSourceConnector.connectorId,
            displayName: "Infisical (source)",
            capability: .programmatic,
            mechanism: "Generates a new value locally and upserts it via REST v3 raw secrets.",
            adminCredentialHint: "Universal Auth clientSecret (clientId stored in config)"),
        ConnectorDescriptor(
            id: AWSIAMConnector.connectorId,
            displayName: "AWS IAM Access Keys",
            capability: .programmatic,
            mechanism: "CreateAccessKey → propagate → deactivate/delete old key (SigV4).",
            adminCredentialHint: "admin accessKeyId:secretAccessKey with iam:CreateAccessKey"),
        ConnectorDescriptor(
            id: GitHubConnector.connectorId,
            displayName: "GitHub",
            capability: .partial,
            mechanism: "OAuth app tokens resettable via API; fine-grained PATs are update-only.",
            adminCredentialHint: "OAuth client_id:client_secret, or an existing PAT (update-only)"),
        ConnectorDescriptor(
            id: StripeConnector.connectorId,
            displayName: "Stripe",
            capability: .programmatic,
            mechanism: "Create a new restricted key via POST /v1/keys, then delete the old one.",
            adminCredentialHint: "Secret key (sk_live_…) with restricted-key permissions"),
        ConnectorDescriptor(
            id: OpenAIConnector.connectorId,
            displayName: "OpenAI",
            capability: .programmatic,
            mechanism: "Admin API: create a project service account, delete the old one.",
            adminCredentialHint: "Admin API key (sk-admin-…)"),
        ConnectorDescriptor(
            id: AnthropicConnector.connectorId,
            displayName: "Anthropic",
            capability: .partial,
            mechanism: "Admin API workspace-scoped key management (create/delete).",
            adminCredentialHint: "Admin API key (sk-ant-admin-…)"),
        ConnectorDescriptor(
            id: CloudflareConnector.connectorId,
            displayName: "Cloudflare",
            capability: .programmatic,
            mechanism: "API token roll via PUT /client/v4/user/tokens/{id}/value.",
            adminCredentialHint: "API token with 'API Tokens: Edit' permission"),
        ConnectorDescriptor(
            id: VercelConnector.connectorId,
            displayName: "Vercel",
            capability: .updateOnly,
            mechanism: "Tokens are created in the Vercel UI; TopSpin stores and propagates.",
            adminCredentialHint: "Any Vercel token (used only to label the account)"),
        ConnectorDescriptor(
            id: TwilioConnector.connectorId,
            displayName: "Twilio",
            capability: .programmatic,
            mechanism: "Create a new API key, then delete the old one (Accounts API).",
            adminCredentialHint: "accountSid:authToken"),
        ConnectorDescriptor(
            id: SendGridConnector.connectorId,
            displayName: "SendGrid",
            capability: .programmatic,
            mechanism: "Create a scoped API key via POST /v3/api_keys, delete the old one.",
            adminCredentialHint: "API key with api_keys.create/delete scopes"),
        ConnectorDescriptor(
            id: SlackConnector.connectorId,
            displayName: "Slack",
            capability: .updateOnly,
            mechanism: "App-level tokens rotate in the Slack app console; TopSpin propagates.",
            adminCredentialHint: "App configuration token (for reference only)"),
        ConnectorDescriptor(
            id: NpmConnector.connectorId,
            displayName: "npm",
            capability: .partial,
            mechanism: "Granular access tokens via registry API where enabled; legacy tokens update-only.",
            adminCredentialHint: "Legacy token or password (+OTP) for registry auth"),
        ConnectorDescriptor(
            id: DockerHubConnector.connectorId,
            displayName: "Docker Hub",
            capability: .programmatic,
            mechanism: "Create a personal access token via /v2/access-tokens, delete the old one.",
            adminCredentialHint: "username:password (or username:currentPAT)"),
        ConnectorDescriptor(
            id: KubernetesConnector.connectorId,
            displayName: "Kubernetes Secret",
            capability: .programmatic,
            mechanism: "Upsert a Secret data key via the API server (PUT /api/v1/namespaces/…/secrets).",
            adminCredentialHint: "Bearer token with secrets write access in the namespace"),
        ConnectorDescriptor(
            id: GenericRESTConnector.connectorId,
            displayName: "Generic REST",
            capability: .programmatic,
            mechanism: "Configurable request template (URL/method/headers/body + response JSON path).",
            adminCredentialHint: "Whatever the template's {{adminCredential}} placeholder expects"),
    ]

    /// All connectors with capability metadata (architecture.md §3 matrix),
    /// including the Grok/Kimi extra catalog.
    public static let all: [ConnectorDescriptor] = shipped + extraCatalog

    /// Looks up a descriptor by connector id.
    public static func descriptor(for id: String) -> ConnectorDescriptor? {
        all.first { $0.id == id }
    }

    /// Capability of a connector id, when known.
    public static func capability(of id: String) -> ConnectorCapability? {
        descriptor(for: id)?.capability
    }
}
