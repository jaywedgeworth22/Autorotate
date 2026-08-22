import { useState } from 'react'
import { toastSuccess } from '@/components/primitives'
import { Field, GhostButton, ModalShell, PrimaryButton, inputCls } from './ui'

export function RequestConnectorModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')

  const submit = () => {
    const id = `REQ-${String(Math.floor(1000 + Math.random() * 9000))}`
    toastSuccess('Request logged', `#${id} — ${name.trim() || 'unnamed platform'}`)
    setName('')
    setUrl('')
    setNotes('')
    onClose()
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Request a connector" width={440}>
      <div className="space-y-4">
        <Field label="Platform name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Datadog" />
        </Field>
        <Field label="API docs URL" optional>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.example.com/api" />
        </Field>
        <Field label="Notes" optional>
          <textarea
            className="min-h-20 w-full rounded-control border border-line-subtle bg-inset px-3 py-2 font-mono text-[13px] text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-spin-dim focus:ring-2 focus:ring-spin-glow"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Which credentials should it rotate?"
          />
        </Field>
        <div className="flex justify-end gap-3 pt-1">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={submit} disabled={!name.trim()}>
            Submit request
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  )
}
