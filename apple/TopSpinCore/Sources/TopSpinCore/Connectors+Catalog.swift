//
//  Connectors+Catalog.swift
//  TopSpinCore
//
//  SPDX-License-Identifier: Apache-2.0
//
//  Extra platform catalog folded in from the Grok App Builder PWA (40+
//  platforms) and the Kimi dump.  Dedicated live connector types stay in
//  Connectors+Providers / Connectors+More.  Everything here is either
//  update-only (import a console-issued value, then PUSH to targets) or
//  local CSPRNG generation (jwt / database / webhook HMAC / generic).
//

import Foundation

// MARK: - Catalog connector

/// Connector for catalog platforms that do not yet have a dedicated live
/// API type in TopSpinCore.  Web already implements live rotate for some
/// of these (Resend, Hugging Face, Neon); native companions import the
/// new value and propagate it through the same LOCK→AUDIT pipeline.
public struct CatalogConnector: SecretConnector {

    public var id: String
    public var displayName: String
    public var capability: ConnectorCapability
    /// When true, `rotate` mints a local CSPRNG value instead of calling a vendor.
    public var generatesLocally: Bool
    public var generatedLength: Int

    public init(id: String,
                displayName: String,
                capability: ConnectorCapability,
                generatesLocally: Bool = false,
                generatedLength: Int = 40) {
        self.id = id
        self.displayName = displayName
        self.capability = capability
        self.generatesLocally = generatesLocally
        self.generatedLength = generatedLength
    }

    public func rotate(adminCredential: String) async throws -> String {
        if generatesLocally {
            return SecretGenerator.randomValue(length: generatedLength)
        }
        throw ConnectorError.manualRotationRequired(connectorId: id)
    }
}

extension ConnectorRegistry {

    /// Platform ids that mint material locally (no vendor API).
    public static let localGenerateIds: Set<String> = [
        "jwt", "database", "webhook_hmac", "generic_secret",
    ]

    /// Grok/Kimi catalog rows appended to ``shipped``.
    static let extraCatalog: [ConnectorDescriptor] = [
        ConnectorDescriptor(
            id: "resend", displayName: "Resend", capability: .updateOnly,
            mechanism: "Create a sending API key in the Resend dashboard (web has a live POST /api-keys rotator).",
            adminCredentialHint: "Admin API key (re_…)"),
        ConnectorDescriptor(
            id: "huggingface", displayName: "Hugging Face", capability: .updateOnly,
            mechanism: "Fine-grained tokens; web can mint via the HF API, native imports the new token.",
            adminCredentialHint: "Access token (hf_…)"),
        ConnectorDescriptor(
            id: "neon", displayName: "Neon", capability: .updateOnly,
            mechanism: "Org API keys; web can mint via console.neon.tech, native imports the new key.",
            adminCredentialHint: "Neon API key"),
        ConnectorDescriptor(
            id: "vault", displayName: "HashiCorp Vault", capability: .updateOnly,
            mechanism: "Tokens are issued in Vault; TopSpin fans the new value out to targets.",
            adminCredentialHint: "Vault token (hvs./s.)"),
        ConnectorDescriptor(
            id: "doppler", displayName: "Doppler", capability: .updateOnly,
            mechanism: "Service tokens are issued in Doppler; TopSpin propagates them.",
            adminCredentialHint: "Doppler service token"),
        ConnectorDescriptor(
            id: "onepassword", displayName: "1Password Connect", capability: .updateOnly,
            mechanism: "Connect tokens are issued in 1Password.",
            adminCredentialHint: "Connect token (ops_/opw_)"),
        ConnectorDescriptor(
            id: "xai", displayName: "xAI", capability: .updateOnly,
            mechanism: "API keys are issued in the xAI console.",
            adminCredentialHint: "xAI API key (xai-)"),
        ConnectorDescriptor(
            id: "groq", displayName: "Groq", capability: .updateOnly,
            mechanism: "API keys are issued in the Groq console.",
            adminCredentialHint: "Groq API key (gsk_)"),
        ConnectorDescriptor(
            id: "google_ai", displayName: "Google AI / Gemini", capability: .updateOnly,
            mechanism: "API keys are issued in AI Studio or Cloud Console.",
            adminCredentialHint: "Google AI API key (AIza…)"),
        ConnectorDescriptor(
            id: "gitlab", displayName: "GitLab", capability: .updateOnly,
            mechanism: "Personal access tokens are created in GitLab.",
            adminCredentialHint: "GitLab PAT (glpat-)"),
        ConnectorDescriptor(
            id: "bitbucket", displayName: "Bitbucket", capability: .updateOnly,
            mechanism: "App passwords / tokens are issued in Bitbucket.",
            adminCredentialHint: "Bitbucket app password"),
        ConnectorDescriptor(
            id: "gcp", displayName: "Google Cloud", capability: .updateOnly,
            mechanism: "Service-account keys are created in GCP IAM.",
            adminCredentialHint: "Service account JSON or token"),
        ConnectorDescriptor(
            id: "azure", displayName: "Azure", capability: .updateOnly,
            mechanism: "Client secrets / keys are issued in Azure AD.",
            adminCredentialHint: "Azure client secret"),
        ConnectorDescriptor(
            id: "netlify", displayName: "Netlify", capability: .updateOnly,
            mechanism: "Personal access tokens are issued in Netlify.",
            adminCredentialHint: "Netlify token"),
        ConnectorDescriptor(
            id: "railway", displayName: "Railway", capability: .updateOnly,
            mechanism: "Account tokens are issued in Railway.",
            adminCredentialHint: "Railway token"),
        ConnectorDescriptor(
            id: "render", displayName: "Render API token", capability: .updateOnly,
            mechanism: "Catalog entry for rotating a Render API token (credential target, not a hosting platform for this fleet).",
            adminCredentialHint: "Render API token"),
        ConnectorDescriptor(
            id: "fly", displayName: "Fly.io", capability: .updateOnly,
            mechanism: "Tokens are issued in the Fly.io dashboard.",
            adminCredentialHint: "Fly API token"),
        ConnectorDescriptor(
            id: "digitalocean", displayName: "DigitalOcean", capability: .updateOnly,
            mechanism: "Personal access tokens are issued in DigitalOcean.",
            adminCredentialHint: "DigitalOcean token"),
        ConnectorDescriptor(
            id: "coolify", displayName: "Coolify", capability: .updateOnly,
            mechanism: "API tokens are issued in the Coolify dashboard.",
            adminCredentialHint: "Coolify API token"),
        ConnectorDescriptor(
            id: "heroku", displayName: "Heroku", capability: .updateOnly,
            mechanism: "API keys are issued in Heroku account settings.",
            adminCredentialHint: "Heroku API key"),
        ConnectorDescriptor(
            id: "discord", displayName: "Discord", capability: .updateOnly,
            mechanism: "Bot tokens are reset in the Discord developer portal.",
            adminCredentialHint: "Bot token"),
        ConnectorDescriptor(
            id: "mailgun", displayName: "Mailgun", capability: .updateOnly,
            mechanism: "API keys are issued in Mailgun.",
            adminCredentialHint: "Mailgun API key"),
        ConnectorDescriptor(
            id: "postmark", displayName: "Postmark", capability: .updateOnly,
            mechanism: "Server tokens are issued in Postmark.",
            adminCredentialHint: "Postmark server token"),
        ConnectorDescriptor(
            id: "supabase", displayName: "Supabase", capability: .updateOnly,
            mechanism: "Service-role keys are issued in the Supabase dashboard.",
            adminCredentialHint: "Supabase service-role key"),
        ConnectorDescriptor(
            id: "planetscale", displayName: "PlanetScale", capability: .updateOnly,
            mechanism: "Service tokens are issued in PlanetScale.",
            adminCredentialHint: "PlanetScale service token"),
        ConnectorDescriptor(
            id: "mongodb", displayName: "MongoDB Atlas", capability: .updateOnly,
            mechanism: "API keys / database passwords are issued in Atlas.",
            adminCredentialHint: "Atlas API key"),
        ConnectorDescriptor(
            id: "fmp", displayName: "Financial Modeling Prep", capability: .updateOnly,
            mechanism: "API keys are issued in the FMP dashboard.",
            adminCredentialHint: "FMP API key"),
        ConnectorDescriptor(
            id: "ssh", displayName: "SSH keys", capability: .updateOnly,
            mechanism: "Import a newly generated key pair; the Mac agent can write Keychain history.",
            adminCredentialHint: "Private key material imported at rotate time"),
        ConnectorDescriptor(
            id: "database", displayName: "Database password", capability: .programmatic,
            mechanism: "Generates a high-entropy password locally, then PUSH to targets. Apply it on the database separately.",
            adminCredentialHint: "Unused for generate-local rotate"),
        ConnectorDescriptor(
            id: "webhook_hmac", displayName: "Webhook / HMAC", capability: .programmatic,
            mechanism: "Generates a new signing secret locally, then PUSH to targets.",
            adminCredentialHint: "Unused for generate-local rotate"),
        ConnectorDescriptor(
            id: "jwt", displayName: "JWT signing key", capability: .programmatic,
            mechanism: "Generates a 64-byte signing secret locally, then PUSH to targets.",
            adminCredentialHint: "Unused for generate-local rotate"),
        ConnectorDescriptor(
            id: "apple_asc", displayName: "App Store Connect", capability: .updateOnly,
            mechanism: "Issue a new .p8 key in App Store Connect, then store it in Keychain and Infisical.",
            adminCredentialHint: "ASC key id / issuer id (p8 imported)"),
        ConnectorDescriptor(
            id: "linear", displayName: "Linear", capability: .updateOnly,
            mechanism: "Personal API keys are created in Linear settings.",
            adminCredentialHint: "Linear API key (lin_api_)"),
        ConnectorDescriptor(
            id: "notion", displayName: "Notion", capability: .updateOnly,
            mechanism: "Internal integration tokens rotate in the Notion integrations page.",
            adminCredentialHint: "Notion token"),
        ConnectorDescriptor(
            id: "generic_secret", displayName: "Generic secret", capability: .programmatic,
            mechanism: "High-entropy local replacement, then write every connected destination.",
            adminCredentialHint: "Unused for generate-local rotate"),
    ]

    /// Builds a catalog connector when `id` is in ``extraCatalog`` (not a shipped live type).
    public static func makeCatalogConnector(id: String) -> CatalogConnector? {
        guard extraCatalog.contains(where: { $0.id == id }),
              let desc = extraCatalog.first(where: { $0.id == id }) else {
            return nil
        }
        return CatalogConnector(
            id: desc.id,
            displayName: desc.displayName,
            capability: desc.capability,
            generatesLocally: localGenerateIds.contains(id),
            generatedLength: id == "jwt" ? 64 : 40)
    }
}
