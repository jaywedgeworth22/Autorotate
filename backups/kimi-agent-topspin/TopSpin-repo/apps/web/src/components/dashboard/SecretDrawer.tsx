import { RotateCw } from 'lucide-react'
import type { SecretWithRelations } from '@contracts/topspin'
import {
  CapabilityBadge,
  FingerprintChip,
  MaskedValue,
  StatusDot,
} from '@/components/primitives'
import type { Capability, StatusState } from '@/components/primitives'
import { parsePolicy, policyLabel, relTime } from './lib'
import { ConnectorTile } from './DueQueue'

const STATUS_MAP: Record<string, StatusState> = {
  healthy: 'healthy',
  due_soon: 'due-soon',
  overdue: 'overdue',
  paused: 'paused',
  rotating: 'running',
  failed: 'overdue',
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-subtle/60 py-3 last:border-0">
      <dt className="text-label shrink-0 pt-0.5 text-ink-muted">{label}</dt>
      <dd className="text-right text-[13px] leading-5 text-ink-secondary">{children}</dd>
    </div>
  )
}

/**
 * Secret detail content rendered inside the shared DetailDrawer.
 */
export function SecretDrawerContent({
  secret,
  rotating,
  onRotate,
}: {
  secret: SecretWithRelations
  rotating: boolean
  onRotate: (secret: SecretWithRelations) => void
}) {
  const policy = parsePolicy(secret.policyJson)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <StatusDot state={STATUS_MAP[secret.status] ?? 'paused'} label={secret.status.replace('_', ' ')} />
        <span className="text-mono-s rounded-chip border border-line-subtle px-2 py-0.5 uppercase text-ink-muted">
          {secret.environment}
        </span>
      </div>

      <dl className="rounded-card border border-line-subtle bg-inset px-4">
        <Row label="Connector">
          <span className="inline-flex items-center gap-2">
            {secret.connector && <ConnectorTile platform={secret.connector.platform} />}
            {secret.connector?.displayName ?? '—'}
          </span>
        </Row>
        <Row label="Capability">
          {secret.connector ? (
            <CapabilityBadge capability={secret.connector.capability as Capability} />
          ) : (
            '—'
          )}
        </Row>
        <Row label="Value">
          <MaskedValue />
        </Row>
        <Row label="Fingerprint">
          {secret.fingerprint ? <FingerprintChip fingerprint={secret.fingerprint} /> : '—'}
        </Row>
        <Row label="Version">
          <span className="font-mono">v{secret.version}</span>
        </Row>
        <Row label="Policy">{policyLabel(policy)}</Row>
        <Row label="Last rotated">{relTime(secret.lastRotatedAt)}</Row>
        <Row label="Next due">{relTime(secret.nextDueAt)}</Row>
      </dl>

      <div>
        <div className="text-label mb-2 text-ink-muted">Targets ({secret.targets.length})</div>
        {secret.targets.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No delivery targets attached.</p>
        ) : (
          <ul className="space-y-2">
            {secret.targets.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-control border border-line-subtle bg-inset px-3 py-2"
              >
                <span className="text-mono-s uppercase text-ink-secondary">{t.kind}</span>
                <span
                  className={
                    t.lastStatus === 'ok'
                      ? 'text-mono-s text-spin'
                      : t.lastStatus === 'failed'
                        ? 'text-mono-s text-danger'
                        : 'text-mono-s text-ink-muted'
                  }
                >
                  {t.lastStatus}
                  {t.lastDeliveredAt ? ` · ${relTime(t.lastDeliveredAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {secret.notes && <p className="text-[13px] leading-5 text-ink-muted">{secret.notes}</p>}

      <button
        onClick={() => onRotate(secret)}
        disabled={rotating}
        className="flex w-full items-center justify-center gap-2 rounded-control bg-spin px-4 py-2.5 text-sm font-semibold text-[#06231A] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-transform duration-100 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCw className={rotating ? 'size-4 animate-dial-spin' : 'size-4'} />
        {rotating ? 'Rotating…' : 'Rotate now'}
      </button>
      <p className="text-mono-s text-center text-ink-faint">plaintext is never stored</p>
    </div>
  )
}
