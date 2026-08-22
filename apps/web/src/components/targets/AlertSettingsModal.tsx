import { useState, useEffect } from 'react'
import { Bell, Send, Slack, MessageSquare } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { Modal, toastError, toastSuccess } from '@/components/primitives'

export function AlertSettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const alertsQuery = trpc.workspace.getAlerts.useQuery(undefined, { enabled: open })
  const [slackUrl, setSlackUrl] = useState('')
  const [discordUrl, setDiscordUrl] = useState('')
  const [notifyOnFailure, setNotifyOnFailure] = useState(true)
  const [notifyOnPartial, setNotifyOnPartial] = useState(true)
  const [notifyOnOverdue, setNotifyOnOverdue] = useState(true)

  useEffect(() => {
    if (alertsQuery.data) {
      setSlackUrl(alertsQuery.data.slackWebhookUrl ?? '')
      setDiscordUrl(alertsQuery.data.discordWebhookUrl ?? '')
      setNotifyOnFailure(alertsQuery.data.notifyOnFailure ?? true)
      setNotifyOnPartial(alertsQuery.data.notifyOnPartial ?? true)
      setNotifyOnOverdue(alertsQuery.data.notifyOnOverdue ?? true)
    }
  }, [alertsQuery.data])

  const updateMut = trpc.workspace.updateAlerts.useMutation({
    onSuccess: () => {
      toastSuccess('Alerts saved', 'Workspace notification preferences updated')
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
      slackWebhookUrl: slackUrl,
      discordWebhookUrl: discordUrl,
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
          Receive real-time alerts whenever a rotation run fails, partially delivers, or a secret becomes overdue.
        </p>

        {/* Slack Webhook */}
        <div className="space-y-2 rounded-card border border-line-subtle bg-panel p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-xs text-ink-primary">
              <Slack className="size-4 text-emerald-400" />
              <span>Slack Incoming Webhook</span>
            </div>
            {slackUrl && (
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
          <input
            type="url"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full rounded-control border border-line-subtle bg-inset px-3 py-2 font-mono text-xs text-ink-primary outline-none focus:border-spin-dim"
          />
        </div>

        {/* Discord Webhook */}
        <div className="space-y-2 rounded-card border border-line-subtle bg-panel p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-xs text-ink-primary">
              <MessageSquare className="size-4 text-indigo-400" />
              <span>Discord Webhook</span>
            </div>
            {discordUrl && (
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
          <input
            type="url"
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full rounded-control border border-line-subtle bg-inset px-3 py-2 font-mono text-xs text-ink-primary outline-none focus:border-spin-dim"
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
                onChange={(e) => setNotifyOnFailure(e.target.checked)}
                className="size-3.5 accent-emerald-400"
              />
              Notify immediately when any rotation run fails
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={notifyOnPartial}
                onChange={(e) => setNotifyOnPartial(e.target.checked)}
                className="size-3.5 accent-emerald-400"
              />
              Notify on partial commits (target delivery failures)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={notifyOnOverdue}
                onChange={(e) => setNotifyOnOverdue(e.target.checked)}
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
