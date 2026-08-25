//
//  ConnectorConfig.swift
//  Autorotate-macOS
//
//  Per-secret, non-secret connector settings and the factory that turns
//  them into a `SecretConnector` instance for `RotationEngine`.
//
//  AutorotateCore connectors are structs whose configuration (IAM user names,
//  project ids, old key ids, …) is supplied at init time. The app persists
//  that configuration as a `[String: String]` dictionary inside the
//  `SecretEntity.connectorConfigData` column (metadata only). Anything that
//  IS secret material — the admin credential — never enters this dictionary:
//  it is stored in the Keychain via `KeychainManager.storeAdminCredential`
//  and fetched by the engine through `AdminCredentialProvider` at run time.
//

import Foundation
import AutorotateCore

/// Well-known keys of the connector settings dictionary.
enum ConnectorSettingsKey {
    static let userName = "userName"                     // aws.iam
    static let oldAccessKeyId = "oldAccessKeyId"         // aws.iam
    static let mode = "mode"                             // github: oauthApp | pat
    static let oauthClientId = "oauthClientId"           // github
    static let tokenToReset = "tokenToReset"             // github
    static let oldKeyId = "oldKeyId"                     // stripe, anthropic
    static let newKeyName = "newKeyName"                 // stripe, anthropic
    static let projectId = "projectId"                   // openai
    static let oldServiceAccountId = "oldServiceAccountId" // openai
    static let workspaceId = "workspaceId"               // anthropic, infisical
    static let tokenId = "tokenId"                       // cloudflare
    static let accountSid = "accountSid"                 // twilio
    static let oldKeySid = "oldKeySid"                   // twilio
    static let teamId = "teamId"                         // vercel (label only)
    static let appId = "appId"                           // slack (label only)
    static let registryUrl = "registryUrl"               // npm
    static let oldTokenKey = "oldTokenKey"               // npm
    static let apiServer = "apiServer"                   // kubernetes
    static let namespace = "namespace"                   // kubernetes
    static let secretName = "secretName"                 // kubernetes, infisical
    static let dataKey = "dataKey"                       // kubernetes
    static let clientId = "clientId"                     // infisical (non-secret)
    static let environment = "environment"               // infisical
    static let secretPath = "secretPath"                 // infisical
    static let baseUrl = "baseUrl"                       // infisical
    static let urlTemplate = "urlTemplate"               // generic.rest
    static let method = "method"                         // generic.rest
    static let responseValueJSONPath = "responseValueJSONPath" // generic.rest
}

/// Builds a configured connector for a record from its persisted settings.
///
/// Missing optional settings fall back to the connectors' own defaults;
/// connectors throw `ConnectorError.misconfigured` at rotation time when a
/// required setting is absent, which the pipeline records as a failed
/// ROTATE step (never a crash).
enum ConnectorFactory {

    static func makeConnector(for record: SecretRecord,
                              settings: [String: String]) throws -> any SecretConnector {
        func value(_ key: String, default fallback: String = "") -> String {
            settings[key] ?? fallback
        }
        switch record.connectorId {
        case AWSIAMConnector.connectorId:
            return AWSIAMConnector(
                userName: value(ConnectorSettingsKey.userName),
                oldAccessKeyId: value(ConnectorSettingsKey.oldAccessKeyId))
        case GitHubConnector.connectorId:
            let mode: GitHubConnector.Mode =
                value(ConnectorSettingsKey.mode) == GitHubConnector.Mode.oauthApp.rawValue
                ? .oauthApp : .pat
            return GitHubConnector(
                mode: mode,
                oauthClientId: value(ConnectorSettingsKey.oauthClientId),
                tokenToReset: value(ConnectorSettingsKey.tokenToReset))
        case StripeConnector.connectorId:
            return StripeConnector(
                newKeyName: value(ConnectorSettingsKey.newKeyName,
                                  default: "autorotate-rotated"),
                oldKeyId: value(ConnectorSettingsKey.oldKeyId))
        case OpenAIConnector.connectorId:
            return OpenAIConnector(
                projectId: value(ConnectorSettingsKey.projectId),
                oldServiceAccountId: value(ConnectorSettingsKey.oldServiceAccountId))
        case AnthropicConnector.connectorId:
            return AnthropicConnector(
                workspaceId: value(ConnectorSettingsKey.workspaceId),
                oldKeyId: value(ConnectorSettingsKey.oldKeyId),
                newKeyName: value(ConnectorSettingsKey.newKeyName,
                                  default: "autorotate-rotated"))
        case CloudflareConnector.connectorId:
            return CloudflareConnector(tokenId: value(ConnectorSettingsKey.tokenId))
        case VercelConnector.connectorId:
            let team = value(ConnectorSettingsKey.teamId)
            return VercelConnector(teamId: team.isEmpty ? nil : team)
        case TwilioConnector.connectorId:
            return TwilioConnector(
                accountSid: value(ConnectorSettingsKey.accountSid),
                oldKeySid: value(ConnectorSettingsKey.oldKeySid))
        case SendGridConnector.connectorId:
            return SendGridConnector(
                newKeyName: value(ConnectorSettingsKey.newKeyName,
                                  default: "autorotate-rotated"),
                oldKeyId: value(ConnectorSettingsKey.oldKeyId))
        case SlackConnector.connectorId:
            let appId = value(ConnectorSettingsKey.appId)
            return SlackConnector(appId: appId.isEmpty ? nil : appId)
        case NpmConnector.connectorId:
            return NpmConnector(
                registryUrl: value(ConnectorSettingsKey.registryUrl,
                                   default: "https://registry.npmjs.org"),
                oldTokenKey: value(ConnectorSettingsKey.oldTokenKey))
        case DockerHubConnector.connectorId:
            return DockerHubConnector()
        case KubernetesConnector.connectorId:
            return KubernetesConnector(
                apiServer: value(ConnectorSettingsKey.apiServer),
                namespace: value(ConnectorSettingsKey.namespace),
                secretName: value(ConnectorSettingsKey.secretName),
                dataKey: value(ConnectorSettingsKey.dataKey))
        case InfisicalSourceConnector.connectorId:
            return InfisicalSourceConnector(
                clientId: value(ConnectorSettingsKey.clientId),
                workspaceId: value(ConnectorSettingsKey.workspaceId),
                environment: value(ConnectorSettingsKey.environment),
                secretPath: value(ConnectorSettingsKey.secretPath, default: "/"),
                secretName: value(ConnectorSettingsKey.secretName, default: record.name),
                baseUrl: URL(string: value(ConnectorSettingsKey.baseUrl,
                                           default: "https://app.infisical.com"))
                    ?? URL(string: "https://app.infisical.com")!)
        case GenericRESTConnector.connectorId:
            return GenericRESTConnector(
                urlTemplate: value(ConnectorSettingsKey.urlTemplate),
                method: value(ConnectorSettingsKey.method, default: "POST"),
                responseValueJSONPath: value(ConnectorSettingsKey.responseValueJSONPath))
        default:
            if let catalog = ConnectorRegistry.makeCatalogConnector(id: record.connectorId) {
                return catalog
            }
            throw ConnectorError.misconfigured(
                "Unknown connector id '\(record.connectorId)'. Registered ids are listed in ConnectorRegistry.all.")
        }
    }
}

/// Which settings fields a given connector id needs — drives the "Connector
/// settings" section of the secret editor.
struct ConnectorField: Identifiable, Sendable {
    var id: String { key }
    let key: String
    let label: String
    let placeholder: String
}

enum ConnectorFieldCatalog {
    static func fields(for connectorId: String) -> [ConnectorField] {
        func f(_ key: String, _ label: String, _ placeholder: String = "") -> ConnectorField {
            ConnectorField(key: key, label: label, placeholder: placeholder)
        }
        switch connectorId {
        case AWSIAMConnector.connectorId:
            return [f(ConnectorSettingsKey.userName, "IAM user name", "deploy-bot"),
                    f(ConnectorSettingsKey.oldAccessKeyId, "Current access key id (optional)", "AKIA…")]
        case GitHubConnector.connectorId:
            return [f(ConnectorSettingsKey.mode, "Mode (oauthApp | pat)", "pat"),
                    f(ConnectorSettingsKey.oauthClientId, "OAuth client id (oauthApp mode)"),
                    f(ConnectorSettingsKey.tokenToReset, "Token to reset (oauthApp mode)")]
        case StripeConnector.connectorId:
            return [f(ConnectorSettingsKey.newKeyName, "New key name", "autorotate-rotated"),
                    f(ConnectorSettingsKey.oldKeyId, "Old key id (optional)", "rk_live_…")]
        case OpenAIConnector.connectorId:
            return [f(ConnectorSettingsKey.projectId, "Project id", "proj_…"),
                    f(ConnectorSettingsKey.oldServiceAccountId, "Old service account id (optional)")]
        case AnthropicConnector.connectorId:
            return [f(ConnectorSettingsKey.workspaceId, "Workspace id"),
                    f(ConnectorSettingsKey.oldKeyId, "Old key id (optional)")]
        case CloudflareConnector.connectorId:
            return [f(ConnectorSettingsKey.tokenId, "API token id to roll")]
        case TwilioConnector.connectorId:
            return [f(ConnectorSettingsKey.accountSid, "Account SID", "AC…"),
                    f(ConnectorSettingsKey.oldKeySid, "Old API key SID (optional)", "SK…")]
        case NpmConnector.connectorId:
            return [f(ConnectorSettingsKey.registryUrl, "Registry URL", "https://registry.npmjs.org"),
                    f(ConnectorSettingsKey.oldTokenKey, "Old token key (optional)")]
        case KubernetesConnector.connectorId:
            return [f(ConnectorSettingsKey.apiServer, "API server", "https://cluster:6443"),
                    f(ConnectorSettingsKey.namespace, "Namespace", "default"),
                    f(ConnectorSettingsKey.secretName, "Secret resource name"),
                    f(ConnectorSettingsKey.dataKey, "Data key")]
        case InfisicalSourceConnector.connectorId:
            return [f(ConnectorSettingsKey.clientId, "Universal Auth client id"),
                    f(ConnectorSettingsKey.workspaceId, "Workspace id"),
                    f(ConnectorSettingsKey.environment, "Environment slug", "prod"),
                    f(ConnectorSettingsKey.secretPath, "Secret path", "/"),
                    f(ConnectorSettingsKey.secretName, "Secret name in Infisical"),
                    f(ConnectorSettingsKey.baseUrl, "Base URL", "https://app.infisical.com")]
        case GenericRESTConnector.connectorId:
            return [f(ConnectorSettingsKey.urlTemplate, "URL template"),
                    f(ConnectorSettingsKey.method, "HTTP method", "POST"),
                    f(ConnectorSettingsKey.responseValueJSONPath, "Response value JSON path (optional)")]
        default:
            if ConnectorRegistry.makeCatalogConnector(id: connectorId) != nil {
                return [f("token", "API token", "paste credential")]
            }
            // Vercel, Slack, Docker Hub need no connector settings.
            return []
        }
    }
}
