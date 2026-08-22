import { useMemo, useState } from 'react'
import {
  ArrowRight,
  FileCode2,
  FileText,
  KeyRound,
  Sparkles,
  Upload,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { Modal, toastError, toastSuccess } from '@/components/primitives'
import { cn } from '@/lib/utils'
import { detectPlatformForKey, parseGlobalApiKeys } from '../../../api/topspin/env-parse'

type ParsedItem = {
  id: string
  name: string
  value: string
  detectedPlatform: string
  selectedPlatform: string
  environment: string
  autoInfisical: boolean
  autoFile: boolean
  selected: boolean
}

export function EnvImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'paste' | 'file'>('paste')
  const [rawText, setRawText] = useState('')
  const [fileName, setFileName] = useState('')
  const [items, setItems] = useState<ParsedItem[]>([])
  const [parsed, setParsed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const connectorsQuery = trpc.connectors.registry.useQuery()
  const availablePlatforms = useMemo(() => connectorsQuery.data ?? [], [connectorsQuery.data])

  const importMut = trpc.secrets.importBatch.useMutation({
    onSuccess: (data) => {
      toastSuccess('Import complete', `${data.importedCount} secret(s) registered into TopSpin`)
      handleReset()
      onClose()
      onImported?.()
    },
    onError: (err) => toastError('Import failed', err.message),
  })

  const handleParse = (textToParse: string) => {
    if (!textToParse.trim()) return
    const result = parseGlobalApiKeys(textToParse)
    const parsedRows: ParsedItem[] = result.keys.map((k, idx) => {
      const detected = detectPlatformForKey(k.key, k.value)
      return {
        id: `${k.key}-${idx}`,
        name: k.key,
        value: k.value,
        detectedPlatform: detected,
        selectedPlatform: detected,
        environment: 'production',
        autoInfisical: true,
        autoFile: false,
        selected: true,
      }
    })
    setItems(parsedRows)
    setParsed(true)
  }

  const handleFileUpload = (file: File) => {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = String(e.target?.result ?? '')
      setRawText(content)
      handleParse(content)
    }
    reader.readAsText(file)
  }

  const handleReset = () => {
    setRawText('')
    setFileName('')
    setItems([])
    setParsed(false)
  }

  const toggleSelectAll = () => {
    const allSelected = items.every((i) => i.selected)
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })))
  }

  const selectedCount = items.filter((i) => i.selected).length

  const executeImport = () => {
    const selected = items.filter((i) => i.selected)
    if (selected.length === 0) return

    const payload = selected.map((i) => {
      const targets = []
      if (i.autoInfisical) {
        targets.push({
          kind: 'infisical' as const,
          config: {
            environment: i.environment,
            secretPath: '/',
            secretName: i.name,
          },
          enabled: true,
        })
      }
      return {
        name: i.name,
        platform: i.selectedPlatform,
        value: i.value,
        environment: i.environment,
        targets,
      }
    })

    importMut.mutate({ items: payload })
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        handleReset()
        onClose()
      }}
      title={
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-spin" />
          <span className="font-display text-lg font-semibold text-ink-primary">
            Import from .env / global-api-keys
          </span>
        </div>
      }
      size="xl"
    >
      <div className="space-y-4">
        {!parsed ? (
          <div className="space-y-4">
            {/* Tab switch */}
            <div className="flex rounded-control border border-line-subtle bg-inset p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-[8px] py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'paste'
                    ? 'bg-raised text-spin shadow-sm'
                    : 'text-ink-muted hover:text-ink-secondary',
                )}
              >
                <FileText className="size-3.5" />
                Paste raw .env text
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-[8px] py-1.5 text-xs font-medium transition-colors',
                  activeTab === 'file'
                    ? 'bg-raised text-spin shadow-sm'
                    : 'text-ink-muted hover:text-ink-secondary',
                )}
              >
                <Upload className="size-3.5" />
                Upload file
              </button>
            </div>

            {activeTab === 'paste' ? (
              <div className="space-y-2">
                <p className="text-[13px] text-ink-secondary">
                  Paste content from <code className="text-mono-s text-spin">.env</code>,{' '}
                  <code className="text-mono-s text-spin">.env.local</code>, or{' '}
                  <code className="text-mono-s text-spin">~/.secrets/global-api-keys</code>:
                </p>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`STRIPE_SECRET_KEY="sk_live_..."\nRESEND_API_KEY="re_..."\nOPENAI_API_KEY="sk-proj-..."\nDATABASE_URL="postgres://..."`}
                  rows={8}
                  className="w-full rounded-control border border-line-subtle bg-inset p-3 font-mono text-[12px] leading-5 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-spin-dim focus:ring-1 focus:ring-spin-dim"
                />
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0])
                }}
                className={cn(
                  'flex flex-col items-center justify-center rounded-card border-2 border-dashed p-8 text-center transition-colors',
                  isDragging
                    ? 'border-spin bg-spin/5'
                    : 'border-line-subtle bg-panel hover:border-line-strong',
                )}
              >
                <FileCode2 className="size-10 text-ink-muted" />
                <p className="mt-2 text-sm font-medium text-ink-primary">
                  {fileName || 'Drag and drop your .env or secret file here'}
                </p>
                <p className="mt-1 text-xs text-ink-muted">Accepts .env, .txt, .keys, .json</p>
                <label className="mt-4 cursor-pointer rounded-control bg-raised px-3.5 py-1.5 text-xs font-medium text-ink-primary hover:bg-panel">
                  Browse files
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileUpload(e.target.files[0])
                    }}
                  />
                </label>
              </div>
            )}

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
                onClick={() => handleParse(rawText)}
                disabled={!rawText.trim()}
                className="flex items-center gap-1.5 rounded-control bg-spin px-4 py-2 text-xs font-semibold text-[#06231A] transition-all hover:brightness-110 disabled:opacity-50"
              >
                Parse & Match Platforms
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-mono-s rounded-chip border border-line-subtle px-2.5 py-1 text-ink-secondary hover:text-ink-primary"
                >
                  {items.every((i) => i.selected) ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-mono-s text-ink-muted">
                  {selectedCount} of {items.length} selected for import
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-ink-muted underline hover:text-ink-secondary"
              >
                Re-paste text
              </button>
            </div>

            {/* Parsed list */}
            <div className="max-h-[380px] overflow-y-auto rounded-card border border-line-subtle bg-panel">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 border-b border-line-subtle bg-panel">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 text-label text-ink-muted">Secret Name</th>
                    <th className="px-3 py-2 text-label text-ink-muted">Detected Platform</th>
                    <th className="px-3 py-2 text-label text-ink-muted">Environment</th>
                    <th className="px-3 py-2 text-label text-ink-muted">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle/50 font-mono text-[12px]">
                  {items.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={cn(
                        'transition-colors hover:bg-raised/60',
                        !item.selected && 'opacity-50',
                      )}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, selected: checked } : it)),
                            )
                          }}
                          className="size-3.5 accent-emerald-400"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-ink-primary">
                        <div className="flex items-center gap-1.5">
                          <KeyRound className="size-3 text-spin" />
                          <span>{item.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.selectedPlatform}
                          onChange={(e) => {
                            const val = e.target.value
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, selectedPlatform: val } : it,
                              ),
                            )
                          }}
                          className="rounded-chip border border-line-subtle bg-inset px-2 py-1 font-mono text-[11px] text-ink-secondary outline-none"
                        >
                          {availablePlatforms.map((p) => (
                            <option key={p.platform} value={p.platform}>
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.environment}
                          onChange={(e) => {
                            const env = e.target.value
                            setItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, environment: env } : it)),
                            )
                          }}
                          className="rounded-chip border border-line-subtle bg-inset px-2 py-1 font-mono text-[11px] text-ink-secondary outline-none"
                        >
                          <option value="production">production</option>
                          <option value="staging">staging</option>
                          <option value="development">development</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-secondary">
                          <input
                            type="checkbox"
                            checked={item.autoInfisical}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, autoInfisical: checked } : it,
                                ),
                              )
                            }}
                            className="size-3 accent-emerald-400"
                          />
                          Infisical (/)
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-line-subtle pt-3">
              <span className="text-mono-s text-ink-muted">
                Plaintext values will be held in memory for target delivery and never persisted in database logs.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-control border border-line-subtle px-4 py-2 text-xs font-medium text-ink-secondary hover:text-ink-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeImport}
                  disabled={selectedCount === 0 || importMut.isPending}
                  className="flex items-center gap-1.5 rounded-control bg-spin px-4 py-2 text-xs font-semibold text-[#06231A] transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {importMut.isPending ? 'Importing…' : `Import ${selectedCount} Secret(s)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
