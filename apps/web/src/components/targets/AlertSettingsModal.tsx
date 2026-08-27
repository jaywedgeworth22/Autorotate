import { useState } from 'react'
import { Bell, Send, Slack, MessageSquare } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { Modal, toastError, toastSuccess } from '@/components/primitives'

/**
 * Workspace alert webhooks (AR-09 / AR-16).  A stored webhook URL is itself a
 * credential, so the server only returns a masked form and this modal can
 * never read one back.  Leaving a field empty keeps the stored webhook;
 * "Remove" clears it.
 */
export function AlertSettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const alertsQuery = trpc.workspace.getAlerts.useQuery(undefined, { enabled: open })
  const alerts = alertsQuery.data
  const [slackUrl, setSlackUrl] = useState('')
  const [discordUrl, setDiscordUrl] = useState('')
  const [clearSlack, setClearSlack] = useState(false)
  const [clearDiscord, setClearDiscord] = useState(false)
  const [triggerOverrides, setTriggerOverrides] = useState<{
    notifyOnFailure?: boolean
    notifyOnPartial?: boolean
    notifyOnOverdue?: boolean
  }>({})

  const notifyOnFailure = triggerOverrides.notifyOnFailure ?? alerts?.notifyOnFailure ?? true
  const notifyOnPartial = triggerOverrides.notifyOnPartial ?? alerts?.notifyOnPartial ?? true
  const notifyOnOverdue = triggerOverrides.notifyOnOverdue ?? alerts?.notifyOnOverdue ?? true

  const updateMut = trpc.workspace.updateAlerts.useMutation({
    onSuccess: async () => {
      toastSuccess('Alerts saved', 'Workspace notification preferences updated')
      setSlackUrl('')
      setDiscordUrl('')
      setClearSlack(false)
      setClearDiscord(false)
      setTriggerOverrides({})
      await utils.workspace.getAlerts.invalidate()
      onClose()
    },
    onError: (err: { message: string }) => toastError('Save failed', err.message),
  })

  const testMut = trpc.workspace.testAlert.useMutation({
    onSuccess: (data: { ok: boolean; message: string }) => {
      if (data.ok) toastSuccess('Test sent', data.message)
      else toastError('Delivery error', data.message)
    },
    onError: (err: { message: string }) => toastError('Test failed', err.message),
  })

  const handleSave = () => {
    updateMut.mutate({
      ...(clearSlack ? { slackWebhookUrl: '' } : slackUrl ? { slackWebhookUrl: slackUrl } : {}),
      ...(clearDiscord
        ? { discordWebhookUrl: '' }
        : discordUrl
          ? { discordWebhookUrl: discordUrl }
          : {}),
      notifyOnFailure,
      notifyOnPartial,
      notifyOnOverdue,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-spin" />
          <span className="font-display text-lg font-semibold text-ink-primary">
            Workspace Alert Webhooks
          </span>
        </div>
      }
      size="md"
    >
      <div className="space-y-5">
        <p className="text-xs text-ink-secondary">
          Alerts fire when a rotation run fails or partially delivers, and once every six hours
          while any secret is past its deadline.  Messages carry the secret name, run id and
          time — never a value or a fingerprint.
        </p>

        {/* Slack Webhook */}
        <div className="space-y-2 rounded-card border border-line-subtle bg-panel p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-xs text-ink-primary">
              <Slack className="size-4 text-emerald-400" />
              <span>Slack Incoming Webhook</span>
            </div>
            {alerts?.hasSlack && (
              <button
                type="button"
                onClick={() => testMut.mutate({ service: 'slack' })}
                disabled={testMut.isPending}
                className="flex items-center gap-1 text-mono-s text-spin hover:underline disabled:opacity-50"
              >
                <Send className="size-3" />
                Test Slack
              </button>
            )}
          </div>
          {alerts?.hasSlack && (
            <div className="flex items-center justify-between gap-2 text-mono-s text-ink-muted">
              <span className="truncate">Stored: {alerts.slackWebhookMasked}</span>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={clearSlack}
                  onChange={(e) => setClearSlack(e.target.checked)}
                  className="size-3.5 accent-emerald-400"
                />
                Remove
              </label>
            </div>
          )}
          <input
            type="url"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            disabled={clearSlack}
            placeholder={
              alerts?.hasSlack
                ? 'Paste a new https:// URL to replace it'
                : 'https://hooks.slack.com/services/...'
            }
            className="w-full rounded-control border border-line-subtle bg-inset px-3 py-2 font-mono text-xs text-ink-primary outline-none focus:border-spin-dim disabled:opacity-50"
          />
        </div>

        {/* Discord Webhook */}
        <div className="space-y-2 rounded-card border border-line-subtle bg-panel p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-xs text-ink-primary">
              <MessageSquare className="size-4 text-indigo-400" />
              <span>Discord Webhook</span>
            </div>
            {alerts?.hasDiscord && (
              <button
                type="button"
                onClick={() => testMut.mutate({ service: 'discord' })}
                disabled={testMut.isPending}
                className="flex items-center gap-1 text-mono-s text-spin hover:underline disabled:opacity-50"
              >
                <Send className="size-3" />
                Test Discord
              </button>
            )}
          </div>
          {alerts?.hasDiscord && (
            <div className="flex items-center justify-between gap-2 text-mono-s text-ink-muted">
              <span className="truncate">Stored: {alerts.discordWebhookMasked}</span>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={clearDiscord}
                  onChange={(e) => setClearDiscord(e.target.checked)}
                  className="size-3.5 accent-emerald-400"
                />
                Remove
              </label>
            </div>
          )}
          <input
            type="url"
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            disabled={clearDiscord}
            placeholder={
              alerts?.hasDiscord
                ? 'Paste a new https:// URL to replace it'
                : 'https://discord.com/api/webhooks/...'
            }
            className="w-full rounded-control border border-line-subtle bg-inset px-3 py-2 font-mono text-xs text-ink-primary outline-none focus:border-spin-dim disabled:opacity-50"
          />
        </div>

        {/* Triggers */}
        <div className="space-y-2 rounded-card border border-line-subtle bg-panel p-3.5">
          <div className="text-label text-ink-muted">Notification Triggers</div>
          <div className="space-y-2 text-xs text-ink-secondary">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={notifyOnFailure}
                onChange={(e) =>
                  setTriggerOverrides((prev) => ({ ...prev, notifyOnFailure: e.target.checked }))
                }
                className="size-3.5 accent-emerald-400"
              />
              Notify immediately when any rotation run fails
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={notifyOnPartial}
                onChange={(e) =>
                  setTriggerOverrides((prev) => ({ ...prev, notifyOnPartial: e.target.checked }))
                }
                className="size-3.5 accent-emerald-400"
              />
              Notify on partial commits (target delivery failures)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={notifyOnOverdue}
                onChange={(e) =>
                  setTriggerOverrides((prev) => ({ ...prev, notifyOnOverdue: e.target.checked }))
                }
                className="size-3.5 accent-emerald-400"
              />
              Notify when secret exceeds rotation policy deadline
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-line-subtle px-4 py-2 text-xs font-medium text-ink-secondary hover:text-ink-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={updateMut.isPending}
            className="rounded-control bg-spin px-4 py-2 text-xs font-semibold text-[#06231A] hover:brightness-110"
          >
            {updateMut.isPending ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
