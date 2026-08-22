import { formatDistanceToNow } from 'date-fns'
import type { ConnectorCapability } from '@contracts/topspin'

/* ------------------------------------------------------------------ */
/* Relative time helper                                                 */
/* ------------------------------------------------------------------ */

export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return 'never'
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return 'never'
  return formatDistanceToNow(d, { addSuffix: true })
}

/* ------------------------------------------------------------------ */
/* Capability mapping (contract enum -> primitive prop)                 */
/* ------------------------------------------------------------------ */

export type PrimitiveCapability = 'programmatic' | 'partial' | 'update-only'

export function toPrimitiveCapability(cap: ConnectorCapability | string): PrimitiveCapability {
  if (cap === 'update_only' || cap === 'update-only') return 'update-only'
  if (cap === 'partial') return 'partial'
  return 'programmatic'
}

/* ------------------------------------------------------------------ */
/* Platform presentation metadata                                       */
/* ------------------------------------------------------------------ */

export interface CredentialField {
  key: string
  label: string
  placeholder?: string
  secret?: boolean
  optional?: boolean
}

export interface PlatformMeta {
  tile: string
  tagline: string
  fields: CredentialField[]
  /** caption hints for capability matrix rows */
  hints: {
    create?: string
    verify?: string
    revoke?: string
    scope?: string
  }
}

const DEFAULT_FIELDS: CredentialField[] = [
  { key: 'token', label: 'API token', placeholder: 'paste credential', secret: true },
]

export const PLATFORM_META: Record<string, PlatformMeta> = {
  aws_iam: {
    tile: 'aw',
    tagline: 'Access keys for users & roles',
    fields: [
      { key: 'accessKeyId', label: 'Access key ID', placeholder: 'AKIA…' },
      { key: 'secretAccessKey', label: 'Secret access key', secret: true },
      { key: 'userName', label: 'IAM user name', placeholder: 'deploy-bot' },
    ],
    hints: {
      create: 'iam:CreateAccessKey',
      verify: 'STS GetCallerIdentity probe',
      revoke: 'iam:DeleteAccessKey',
      scope: 'policy templates',
    },
  },
  github: {
    tile: 'gh',
    tagline: 'PATs, deploy keys, Actions secrets',
    fields: [{ key: 'token', label: 'Admin PAT', placeholder: 'ghp_…', secret: true }],
    hints: { verify: 'GET /user probe', create: 'credential minting via PAT scope' },
  },
  stripe: {
    tile: 'st',
    tagline: 'Restricted & secret API keys',
    fields: [{ key: 'adminKey', label: 'Admin secret key', placeholder: 'sk_live_…', secret: true }],
    hints: { create: 'POST /v1/api_keys', verify: 'GET /v1/account', revoke: 'DELETE rolled key' },
  },
  openai: {
    tile: 'oa',
    tagline: 'Project API keys',
    fields: [
      { key: 'adminKey', label: 'Admin API key', placeholder: 'sk-admin-…', secret: true },
      { key: 'projectId', label: 'Project ID', placeholder: 'proj_…' },
    ],
    hints: { create: 'service-account API', verify: 'GET /v1/models' },
  },
  anthropic: {
    tile: 'an',
    tagline: 'Workspace API keys',
    fields: [{ key: 'adminKey', label: 'Workspace admin key', placeholder: 'sk-ant-…', secret: true }],
    hints: { verify: 'GET /v1/models probe' },
  },
  cloudflare: {
    tile: 'cf',
    tagline: 'API tokens with scoped policies',
    fields: [
      { key: 'apiToken', label: 'API token', secret: true },
      { key: 'accountId', label: 'Account ID' },
      { key: 'tokenId', label: 'Token ID to roll' },
    ],
    hints: { create: 'PUT token value roll', verify: 'GET /user/tokens/verify', scope: 'scoped token policies' },
  },
  vercel: {
    tile: 've',
    tagline: 'Account & team tokens',
    fields: [
      { key: 'token', label: 'Account token', secret: true },
      { key: 'teamId', label: 'Team ID', optional: true },
    ],
    hints: { verify: 'GET /v2/user' },
  },
  twilio: {
    tile: 'tw',
    tagline: 'Auth tokens & API key SIDs',
    fields: [
      { key: 'accountSid', label: 'Account SID', placeholder: 'AC…' },
      { key: 'authToken', label: 'Auth token', secret: true },
    ],
    hints: { create: 'POST Keys.json', verify: 'GET /Accounts/{sid}.json' },
  },
  sendgrid: {
    tile: 'sg',
    tagline: 'Scoped API keys',
    fields: [{ key: 'adminKey', label: 'Admin API key', placeholder: 'SG.…', secret: true }],
    hints: { create: 'POST /v3/api_keys', verify: 'GET /v3/scopes', scope: 'mail.send-style scopes' },
  },
  slack: {
    tile: 'sl',
    tagline: 'Bot & user tokens',
    fields: [{ key: 'botToken', label: 'Bot token', placeholder: 'xoxb-…', secret: true }],
    hints: { verify: 'auth.test probe' },
  },
  npm: {
    tile: 'npm',
    tagline: 'Automation & publish tokens',
    fields: [{ key: 'token', label: 'npm token', placeholder: 'npm_…', secret: true }],
    hints: { create: 'POST /-/npm/v1/tokens', verify: 'GET /-/npm/v1/tokens' },
  },
  dockerhub: {
    tile: 'dh',
    tagline: 'Access tokens',
    fields: [
      { key: 'username', label: 'Docker Hub username' },
      { key: 'password', label: 'Password / PAT', secret: true },
    ],
    hints: { create: 'POST /v2/access-tokens', verify: 'POST /v2/users/login' },
  },
  kubernetes: {
    tile: 'k8',
    tagline: 'Service-account tokens via cluster API',
    fields: [
      { key: 'apiServer', label: 'API server URL', placeholder: 'https://cluster:6443' },
      { key: 'token', label: 'Admin token', secret: true },
      { key: 'namespace', label: 'Namespace', placeholder: 'default', optional: true },
    ],
    hints: { create: 'serviceaccount API', verify: 'GET /version', scope: 'namespace-scoped RBAC' },
  },
  generic_rest: {
    tile: '{}',
    tagline: 'Any header/body token over HTTPS',
    fields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.example.com' },
      { key: 'authHeader', label: 'Auth header name', placeholder: 'Authorization' },
      { key: 'token', label: 'Token', secret: true },
    ],
    hints: { verify: 'base URL health probe' },
  },
  infisical: {
    tile: 'in',
    tagline: 'Infisical source credentials',
    fields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://app.infisical.com' },
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client secret', secret: true },
      { key: 'workspaceId', label: 'Workspace ID', optional: true },
    ],
    hints: { verify: 'service-token login' },
  },
}

export function platformMeta(platform: string): PlatformMeta {
  return (
    PLATFORM_META[platform] ?? {
      tile: platform.slice(0, 2).toLowerCase(),
      tagline: 'Custom platform connector',
      fields: DEFAULT_FIELDS,
      hints: {},
    }
  )
}

/* ------------------------------------------------------------------ */
/* Capability matrix (5 rows per connector, driven by capability level) */
/* ------------------------------------------------------------------ */

export type MatrixRowState = 'ok' | 'warn' | 'off' | 'muted'

export interface MatrixRow {
  key: string
  label: string
  state: MatrixRowState
  caption: string
}

export function capabilityMatrix(capability: PrimitiveCapability, platform: string): MatrixRow[] {
  const hints = platformMeta(platform).hints
  const p = capability === 'programmatic'
  const partial = capability === 'partial'
  const updateOnly = capability === 'update-only'
  return [
    {
      key: 'create',
      label: 'Create credential',
      state: updateOnly ? 'off' : 'ok',
      caption: updateOnly
        ? 'you supply the new value; TopSpin handles the rest'
        : (hints.create ?? 'provider API mints credentials'),
    },
    {
      key: 'verify',
      label: 'Verify credential',
      state: 'ok',
      caption: hints.verify ?? 'post-write probe',
    },
    {
      key: 'revoke',
      label: 'Revoke credential',
      state: p ? 'ok' : partial ? 'warn' : 'off',
      caption: p
        ? (hints.revoke ?? 'provider API revoke')
        : partial
          ? 'revocation via queued follow-up task'
          : 'manual revocation — TopSpin schedules the follow-up',
    },
    {
      key: 'scope',
      label: 'Scoped least-privilege',
      state: p ? 'ok' : partial ? 'warn' : 'muted',
      caption: p
        ? (hints.scope ?? 'scoped token templates')
        : partial
          ? 'partial scoping — review after rotation'
          : 'scopes managed outside TopSpin',
    },
    {
      key: 'expiry',
      label: 'Native expiry metadata',
      state: platform === 'kubernetes' ? 'ok' : 'muted',
      caption: platform === 'kubernetes' ? 'token TTL metadata' : 'TopSpin tracks age instead',
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Shared tiny components                                               */
/* ------------------------------------------------------------------ */

export function statusToDot(status: string): { state: 'healthy' | 'overdue' | 'paused'; label: string } {
  if (status === 'connected') return { state: 'healthy', label: 'connected' }
  if (status === 'error') return { state: 'overdue', label: 'error' }
  return { state: 'paused', label: 'not connected' }
}
