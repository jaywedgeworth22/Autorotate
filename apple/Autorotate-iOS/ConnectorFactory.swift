//
//  ConnectorFactory.swift
//  Autorotate-iOS
//
//  Builds AutorotateCore connector instances from the per-secret configuration
//  map persisted in SwiftData (see `SDConnectorConfig`). The registry in
//  AutorotateCore stores only descriptors; instantiation needs the app-side
//  config (account ids, project ids, templates — never secrets).
//
//  The admin credential is NOT part of this config: the engine fetches it
//  from the Keychain via `AdminCredentialProvider` at rotation time.
//

import Foundation
import AutorotateCore

enum ConnectorFactory {

    /// One connector-configuration input shown in the add-secret form.
    struct FieldSpec: Identifiable, Sendable {
        let key: String
        let label: String
        var placeholder: String = ""
        var isOptional: Bool = false
        var help: String? = nil

        var id: String { key }
    }

    // MARK: - Field specs per connector

    static func fields(for connectorId: String) -> [FieldSpec] {
        switch connectorId {
        case InfisicalSourceConnector.connectorId:
            return [
                FieldSpec(key: "clientId", label: "Client ID",
                          placeholder: "Universal Auth client id",
                          help: "The clientSecret is entered below and stored only in the Keychain."),
                FieldSpec(key: "workspaceId", label: "Workspace ID", placeholder: "Infisical project id"),
                FieldSpec(key: "environment", label: "Environment", placeholder: "prod"),
                FieldSpec(key: "secretPath", label: "Secret Path", placeholder: "/", isOptional: true),
                FieldSpec(key: "secretName", label: "Infisical Secret Name", placeholder: "MY_SECRET"),
                FieldSpec(key: "baseUrl", label: "Base URL", placeholder: "https://app.infisical.com", isOptional: true)
            ]
        case AWSIAMConnector.connectorId:
            return [
                FieldSpec(key: "userName", label: "IAM User Name", placeholder: "deploy-bot"),
                FieldSpec(key: "oldAccessKeyId", label: "Current Access Key ID",
                          placeholder: "AKIA…", isOptional: true,
                          help: "Deactivated (not deleted) after rotation.")
            ]
        case GitHubConnector.connectorId:
            return [
                FieldSpec(key: "mode", label: "Mode", placeholder: "oauthApp or pat",
                          help: "OAuth app tokens rotate via API; PATs are update-only."),
                FieldSpec(key: "oauthClientId", label: "OAuth Client ID", isOptional: true),
                FieldSpec(key: "tokenToReset", label: "Token to Reset", isOptional: true)
            ]
        case StripeConnector.connectorId:
            return [
                FieldSpec(key: "newKeyName", label: "New Key Name", placeholder: "autorotate-rotated", isOptional: true),
                FieldSpec(key: "permissions", label: "Permissions", placeholder: "charges:write, customers:read",
                          isOptional: true, help: "Comma-separated permission:access pairs for the restricted key."),
                FieldSpec(key: "oldKeyId", label: "Old Key ID", placeholder: "rk_live_…", isOptional: true)
            ]
        case OpenAIConnector.connectorId:
            return [
                FieldSpec(key: "projectId", label: "Project ID", placeholder: "proj_…"),
                FieldSpec(key: "oldServiceAccountId", label: "Old Service Account ID", isOptional: true),
                FieldSpec(key: "newServiceAccountName", label: "New SA Name",
                          placeholder: "autorotate-rotated", isOptional: true)
            ]
        case AnthropicConnector.connectorId:
            return [
                FieldSpec(key: "workspaceId", label: "Workspace ID"),
                FieldSpec(key: "oldKeyId", label: "Old Key ID", isOptional: true),
                FieldSpec(key: "newKeyName", label: "New Key Name", placeholder: "autorotate-rotated", isOptional: true)
            ]
        case CloudflareConnector.connectorId:
            return [
                FieldSpec(key: "tokenId", label: "Token ID",
                          help: "The token whose value is rolled via PUT …/tokens/{id}/value.")
            ]
        case VercelConnector.connectorId:
            return [
                FieldSpec(key: "teamId", label: "Team ID", isOptional: true,
                          help: "Update-only: rotate in the Vercel UI, then import the new token.")
            ]
        case TwilioConnector.connectorId:
            return [
                FieldSpec(key: "accountSid", label: "Account SID", placeholder: "AC…"),
                FieldSpec(key: "oldKeySid", label: "Old Key SID", placeholder: "SK…", isOptional: true),
                FieldSpec(key: "newKeyFriendlyName", label: "New Key Name",
                          placeholder: "autorotate-rotated", isOptional: true)
            ]
        case SendGridConnector.connectorId:
            return [
                FieldSpec(key: "newKeyName", label: "New Key Name", placeholder: "autorotate-rotated", isOptional: true),
                FieldSpec(key: "scopes", label: "Scopes", placeholder: "mail.send", isOptional: true,
                          help: "Comma-separated scopes for the new API key."),
                FieldSpec(key: "oldKeyId", label: "Old Key ID", isOptional: true)
            ]
        case SlackConnector.connectorId:
            return [
                FieldSpec(key: "appId", label: "App ID", placeholder: "A…", isOptional: true,
                          help: "Update-only: rotate in the Slack app console, then import.")
            ]
        case NpmConnector.connectorId:
            return [
                FieldSpec(key: "registryUrl", label: "Registry URL",
                          placeholder: "https://registry.npmjs.org", isOptional: true),
                FieldSpec(key: "newTokenName", label: "New Token Name", placeholder: "autorotate-rotated", isOptional: true),
                FieldSpec(key: "oldTokenKey", label: "Old Token Key (uuid)", isOptional: true),
                FieldSpec(key: "expiresInDays", label: "Expires In (days)", isOptional: true)
            ]
        case DockerHubConnector.connectorId:
            return [
                FieldSpec(key: "newTokenLabel", label: "New Token Label",
                          placeholder: "autorotate-rotated", isOptional: true),
                FieldSpec(key: "scopes", label: "Scopes", placeholder: "repo:admin", isOptional: true),
                FieldSpec(key: "oldTokenUUID", label: "Old Token UUID", isOptional: true)
            ]
        case KubernetesConnector.connectorId:
            return [
                FieldSpec(key: "apiServer", label: "API Server", placeholder: "https://cluster.example:6443"),
                FieldSpec(key: "namespace", label: "Namespace", placeholder: "default"),
                FieldSpec(key: "secretName", label: "Secret Name"),
                FieldSpec(key: "dataKey", label: "Data Key")
            ]
        case GenericRESTConnector.connectorId:
            return [
                FieldSpec(key: "urlTemplate", label: "URL Template",
                          placeholder: "https://api.example.com/rotate"),
                FieldSpec(key: "method", label: "Method", placeholder: "POST", isOptional: true),
                FieldSpec(key: "bodyTemplate", label: "Body Template",
                          placeholder: "{\"value\": \"{{generatedValue}}\"}", isOptional: true,
                          help: "Placeholders: {{adminCredential}}, {{generatedValue}}."),
                FieldSpec(key: "responseValueJSONPath", label: "Response JSON Path",
                          placeholder: "data.token", isOptional: true),
                FieldSpec(key: "generatedValueLength", label: "Generated Length",
                          placeholder: "40", isOptional: true)
            ]
        default:
            if ConnectorRegistry.makeCatalogConnector(id: connectorId) != nil {
                return [
                    FieldSpec(key: "token", label: "API token",
                              placeholder: "paste credential",
                              isOptional: true,
                              help: "Update-only catalog platforms: rotate in the vendor console, then import.  Generate-local platforms ignore this field.")
                ]
            }
            return []
        }
    }

    // MARK: - Instantiation

    enum FactoryError: Error, CustomStringConvertible {
        case unknownConnector(String)
        case missingField(connector: String, field: String)
        case invalidURL(String)

        var description: String {
            switch self {
            case .unknownConnector(let id):
                return "Unknown connector '\(id)'."
            case .missingField(let connector, let field):
                return "Connector '\(connector)' is missing required config field '\(field)'."
            case .invalidURL(let value):
                return "Invalid URL: \(value)"
            }
        }
    }

    /// Builds the connector for a record from its persisted config map.
    /// Missing optional fields fall back to the connector's own defaults.
    static func makeConnector(connectorId: String,
                              config: [String: String]) throws -> any SecretConnector {
        func require(_ key: String) throws -> String {
            let value = config[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !value.isEmpty else {
                throw FactoryError.missingField(connector: connectorId, field: key)
            }
            return value
        }
        func optional(_ key: String) -> String {
            config[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        func optionalInt(_ key: String) -> Int? {
            Int(optional(key))
        }
        func list(_ key: String) -> [String] {
            optional(key).split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        }

        switch connectorId {
        case InfisicalSourceConnector.connectorId:
            let baseUrlString = optional("baseUrl")
            let baseUrl = baseUrlString.isEmpty
                ? URL(string: "https://app.infisical.com")!
                : URL(string: baseUrlString)
            guard let baseUrl else { throw FactoryError.invalidURL(baseUrlString) }
            return InfisicalSourceConnector(
                clientId: try require("clientId"),
                workspaceId: try require("workspaceId"),
                environment: try require("environment"),
                secretPath: optional("secretPath").isEmpty ? "/" : optional("secretPath"),
                secretName: try require("secretName"),
                baseUrl: baseUrl,
                valueLength: optionalInt("valueLength") ?? 40)

        case AWSIAMConnector.connectorId:
            return AWSIAMConnector(userName: try require("userName"),
                                   oldAccessKeyId: optional("oldAccessKeyId"))

        case GitHubConnector.connectorId:
            let mode: GitHubConnector.Mode = optional("mode") == "pat" ? .pat : .oauthApp
            return GitHubConnector(mode: mode,
                                   oauthClientId: optional("oauthClientId"),
                                   tokenToReset: optional("tokenToReset"))

        case StripeConnector.connectorId:
            var permissions: [String: String] = [:]
            for pair in list("permissions") {
                let halves = pair.split(separator: ":", maxSplits: 1).map(String.init)
                if halves.count == 2 { permissions[halves[0]] = halves[1] }
            }
            return StripeConnector(
                newKeyName: optional("newKeyName").isEmpty ? "autorotate-rotated" : optional("newKeyName"),
                permissions: permissions,
                oldKeyId: optional("oldKeyId"))

        case OpenAIConnector.connectorId:
            return OpenAIConnector(
                projectId: try require("projectId"),
                oldServiceAccountId: optional("oldServiceAccountId"),
                newServiceAccountName: optional("newServiceAccountName").isEmpty
                    ? "autorotate-rotated" : optional("newServiceAccountName"))

        case AnthropicConnector.connectorId:
            return AnthropicConnector(
                workspaceId: try require("workspaceId"),
                oldKeyId: optional("oldKeyId"),
                newKeyName: optional("newKeyName").isEmpty ? "autorotate-rotated" : optional("newKeyName"))

        case CloudflareConnector.connectorId:
            return CloudflareConnector(tokenId: try require("tokenId"))

        case VercelConnector.connectorId:
            return VercelConnector(teamId: optional("teamId").isEmpty ? nil : optional("teamId"))

        case TwilioConnector.connectorId:
            return TwilioConnector(
                accountSid: try require("accountSid"),
                oldKeySid: optional("oldKeySid"),
                newKeyFriendlyName: optional("newKeyFriendlyName").isEmpty
                    ? "autorotate-rotated" : optional("newKeyFriendlyName"))

        case SendGridConnector.connectorId:
            let scopes = list("scopes")
            return SendGridConnector(
                newKeyName: optional("newKeyName").isEmpty ? "autorotate-rotated" : optional("newKeyName"),
                scopes: scopes.isEmpty ? ["mail.send"] : scopes,
                oldKeyId: optional("oldKeyId"))

        case SlackConnector.connectorId:
            return SlackConnector(appId: optional("appId").isEmpty ? nil : optional("appId"))

        case NpmConnector.connectorId:
            return NpmConnector(
                registryUrl: optional("registryUrl").isEmpty
                    ? "https://registry.npmjs.org" : optional("registryUrl"),
                newTokenName: optional("newTokenName").isEmpty ? "autorotate-rotated" : optional("newTokenName"),
                oldTokenKey: optional("oldTokenKey"),
                expiresInDays: optionalInt("expiresInDays"))

        case DockerHubConnector.connectorId:
            let scopes = list("scopes")
            return DockerHubConnector(
                newTokenLabel: optional("newTokenLabel").isEmpty ? "autorotate-rotated" : optional("newTokenLabel"),
                scopes: scopes.isEmpty ? ["repo:admin"] : scopes,
                oldTokenUUID: optional("oldTokenUUID"))

        case KubernetesConnector.connectorId:
            return KubernetesConnector(
                apiServer: try require("apiServer"),
                namespace: try require("namespace"),
                secretName: try require("secretName"),
                dataKey: try require("dataKey"))

        case GenericRESTConnector.connectorId:
            return GenericRESTConnector(
                urlTemplate: try require("urlTemplate"),
                method: optional("method").isEmpty ? "POST" : optional("method"),
                bodyTemplate: optional("bodyTemplate"),
                responseValueJSONPath: optional("responseValueJSONPath"),
                generatedValueLength: optionalInt("generatedValueLength") ?? 40)

        default:
            if let catalog = ConnectorRegistry.makeCatalogConnector(id: connectorId) {
                return catalog
            }
            throw FactoryError.unknownConnector(connectorId)
        }
    }
}
