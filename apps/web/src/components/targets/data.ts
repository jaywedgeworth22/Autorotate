import type {
  FileFormat,
  FileTargetConfig,
  InfisicalTargetConfig,
  KeychainTargetConfig,
  SecretWithRelations,
  Target,
  TargetKind,
  WebhookTargetConfig,
} from '@contracts/autorotate'

export type { TargetKind }

/** A target row joined with its owning secret's display info. */
export interface BoundTarget extends Target {
  secretName: string
  secretStatus: string
  environment: string
  secretFingerprint: string | null
}

export function flattenTargets(secrets: SecretWithRelations[]): BoundTarget[] {
  return secrets.flatMap((s) =>
    (s.targets ?? []).map((t) => ({
      ...t,
      secretName: s.name,
      secretStatus: s.status,
      environment: s.environment,
      secretFingerprint: s.fingerprint,
    })),
  )
}

/* ------------------------------------------------------------------ */
/* File format auto-detection                                           */
/* ------------------------------------------------------------------ */

export function detectFormat(path: string): FileFormat {
  const p = path.toLowerCase().trim()
  const base = p.split('/').pop() ?? p
  if (base === '.env' || base.endsWith('.env') || base.startsWith('.env.')) return 'env'
  if (base.endsWith('.json')) return 'json'
  if (base.endsWith('.yaml') || base.endsWith('.yml')) return 'yaml'
  if (base.endsWith('.toml')) return 'toml'
  if (base.endsWith('.ini') || base.endsWith('.conf') || base === 'credentials' || base === 'config')
    return 'ini'
  return 'env'
}

export const FORMAT_LABEL: Record<FileFormat, string> = {
  env: 'ENV',
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  ini: 'INI',
}

/* ------------------------------------------------------------------ */
/* Config accessors (configJson is unknown-shaped from the API)         */
/* ------------------------------------------------------------------ */

export function fileCfg(t: Target): FileTargetConfig {
  return (t.configJson ?? {}) as unknown as FileTargetConfig
}
export function infisicalCfg(t: Target): InfisicalTargetConfig {
  return (t.configJson ?? {}) as unknown as InfisicalTargetConfig
}
export function webhookCfg(t: Target): WebhookTargetConfig {
  return (t.configJson ?? {}) as unknown as WebhookTargetConfig
}
export function keychainCfg(t: Target): KeychainTargetConfig {
  return (t.configJson ?? {}) as unknown as KeychainTargetConfig
}

/* ------------------------------------------------------------------ */
/* Grouping — one display row per workspace / file path / endpoint      */
/* ------------------------------------------------------------------ */

export interface TargetGroup {
  key: string
  kind: TargetKind
  /** primary mono label (workspace slug / path / URL / service) */
  title: string
  subtitle: string
  format: FileFormat | null
  targets: BoundTarget[]
  lastDeliveredAt: Date | null
  status: 'ok' | 'failed' | 'pending'
  anyEnabled: boolean
}

export function groupTargets(kind: TargetKind, targets: BoundTarget[]): TargetGroup[] {
  const groups = new Map<string, BoundTarget[]>()
  for (const t of targets) {
    if (t.kind !== kind) continue
    let key: string
    if (kind === 'file') key = fileCfg(t).path ?? `target-${t.id}`
    else if (kind === 'webhook') key = `${webhookCfg(t).method ?? 'POST'} ${webhookCfg(t).url ?? t.id}`
    else if (kind === 'infisical') {
      const c = infisicalCfg(t)
      key = `${c.baseUrl ?? ''}|${c.workspaceId ?? ''}|${c.environment ?? ''}|${c.secretPath ?? ''}`
    } else {
      const c = keychainCfg(t)
      key = `${c.service ?? ''}|${c.account ?? ''}`
    }
    const list = groups.get(key) ?? []
    list.push(t)
    groups.set(key, list)
  }

  return [...groups.entries()].map(([key, list]) => {
    const first = list[0]
    let title = key
    let subtitle = ''
    let format: FileFormat | null = null
    if (kind === 'file') {
      const c = fileCfg(first)
      title = c.path
      format = detectFormat(c.path)
      subtitle = c.key ? `key ${c.key}` : ''
    } else if (kind === 'webhook') {
      const c = webhookCfg(first)
      title = c.url
      subtitle = `${c.method ?? 'POST'} · ${c.includeValue ? 'includes value ref' : 'metadata only'}`
    } else if (kind === 'infisical') {
      const c = infisicalCfg(first)
      title = c.workspaceId || 'workspace'
      subtitle = `${c.environment ?? 'prod'} · ${c.secretPath ?? '/'}`
    } else {
      const c = keychainCfg(first)
      title = c.account
      subtitle = c.service
    }
    const delivered = list
      .map((t) => t.lastDeliveredAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    const status: TargetGroup['status'] = list.some((t) => t.lastStatus === 'failed')
      ? 'failed'
      : list.every((t) => t.lastStatus === 'pending')
        ? 'pending'
        : 'ok'
    return {
      key,
      kind,
      title,
      subtitle,
      format,
      targets: list,
      lastDeliveredAt: delivered[0] ?? null,
      status,
      anyEnabled: list.some((t) => t.enabled),
    }
  })
}

export const KIND_LABEL: Record<TargetKind, string> = {
  infisical: 'Infisical',
  file: 'Files',
  webhook: 'Webhooks',
  keychain: 'Apple Keychain',
}
