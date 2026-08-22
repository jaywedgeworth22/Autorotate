import { useState } from 'react'
import { Check, Copy, QrCode, ShieldCheck, Smartphone } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { Modal, toastSuccess } from '@/components/primitives'

export function QRCodePairingModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const pairingQuery = trpc.pairing.getPayload.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  })

  const payload = pairingQuery.data
  const payloadJson = payload ? JSON.stringify(payload) : ''

  const handleCopy = () => {
    if (!payloadJson) return
    navigator.clipboard.writeText(payloadJson)
    setCopied(true)
    toastSuccess('Copied', 'Pairing configuration copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  // Generate SVG QR Code URL using standard public QR generator or SVG matrix
  const qrSvgUrl = payloadJson
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        payloadJson,
      )}&bgcolor=141816&color=4ECCA3&margin=10`
    : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Smartphone className="size-5 text-spin" />
          <span className="font-display text-lg font-semibold text-ink-primary">
            Pair with Autorotate Mobile App
          </span>
        </div>
      }
      size="md"
    >
      <div className="space-y-4 text-center">
        <p className="text-xs text-ink-secondary">
          Scan this QR code with the Autorotate iOS or Android Companion App to instantly pair your workspace,
          enable biometric security, and trigger on-device rotations.
        </p>

        {/* QR container */}
        <div className="mx-auto flex w-fit flex-col items-center justify-center rounded-2xl border border-line-subtle bg-inset p-5 shadow-inner">
          {qrSvgUrl ? (
            <img
              src={qrSvgUrl}
              alt="Autorotate Mobile Pairing QR Code"
              className="size-52 rounded-lg border border-line-subtle"
            />

          ) : (
            <div className="flex size-52 items-center justify-center text-ink-muted">
              <QrCode className="size-12 animate-pulse text-spin" />
            </div>
          )}
          <div className="mt-3 flex items-center gap-1.5 text-mono-s text-spin">
            <ShieldCheck className="size-3.5" />
            <span>End-to-End Encrypted Pairing</span>
          </div>
        </div>

        {/* Fallback payload copy */}
        <div className="space-y-1.5 text-left">
          <label className="text-label text-ink-muted">Manual Pairing Payload</label>
          <div className="flex items-center gap-2 rounded-control border border-line-subtle bg-panel p-2 font-mono text-[11px] text-ink-secondary">
            <input
              type="text"
              readOnly
              value={payloadJson}
              className="w-full bg-transparent outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-chip bg-raised px-2.5 py-1 text-ink-primary hover:bg-panel"
            >
              {copied ? <Check className="size-3 text-spin" /> : <Copy className="size-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <div className="border-t border-line-subtle pt-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-control bg-spin py-2 text-xs font-semibold text-[#06231A] transition-all hover:brightness-110"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
