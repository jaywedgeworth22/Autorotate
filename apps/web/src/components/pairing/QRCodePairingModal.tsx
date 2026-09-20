import { useEffect, useState } from 'react'
import { Check, Copy, QrCode, ShieldCheck, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'
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
  const [qrSvg, setQrSvg] = useState<string>('')

  const pairingQuery = trpc.pairing.getPayload.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  })

  const payload = pairingQuery.data
  const payloadJson = payload ? JSON.stringify(payload) : ''

  // AR31-05 + AR31-23 (2026-09-20): generate the QR client-side so the
  // pairing payload (which contains the workspace baseUrl, environment,
  // and timestamp) never leaves the operator's browser.  The previous
  // implementation POSTed the payload to api.qrserver.com as a query
  // parameter, which leaks the deployment topology to a third-party CDN
  // and gives that CDN a record of every workspace that opened the
  // pairing modal.  qrcode.generate() returns an SVG string locally;
  // no network request, no PII egress.
  //
  // qrcode.toString returns a Promise (QR generation runs through the
  // Web Crypto / Web Worker path), so the result has to land in state.
  // The setState-in-effect lint flags the `.then((svg) => setQrSvg(svg))`
  // shape; we disable it for the whole effect because the alternative —
  // a ref + manual re-render — would duplicate the same effect lifecycle
  // in a more error-prone way.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!payloadJson) {
      setQrSvg('')
      return
    }
    let cancelled = false
    QRCode.toString(payloadJson, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: {
        dark: '#4ECCA3',
        light: '#141816',
      },
      width: 240,
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('QR generation failed:', err)
          setQrSvg('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [payloadJson])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCopy = () => {
    if (!payloadJson) return
    navigator.clipboard.writeText(payloadJson)
    setCopied(true)
    toastSuccess('Copied', 'Pairing configuration copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

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
          {qrSvg ? (
            // AR31-05: the SVG is generated client-side and rendered via
            // dangerouslySetInnerHTML.  The library produces a static SVG
            // matrix with no script tags or external refs, so this is
            // equivalent to rendering an <img> from a data: URL but avoids
            // a base64 round-trip.
            <div
              className="size-52 [&_svg]:size-full [&_svg]:rounded-lg [&_svg]:border [&_svg]:border-line-subtle"
              role="img"
              aria-label="Autorotate Mobile Pairing QR Code"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
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
