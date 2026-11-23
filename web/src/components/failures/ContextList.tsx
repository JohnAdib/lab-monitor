// Shows whatever an instrument reported about a fault. Nothing enumerates the
// keys and new instruments arrive unannounced, so nothing here is per-device.

const humanise = (key: string) => key.replace(/_/g, ' ')

function format(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function ContextList({
  context,
}: {
  context: Record<string, unknown> | undefined
}) {
  const entries = Object.entries(context ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  if (entries.length === 0) return null
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-slate-500">{humanise(key)}</dt>
          <dd className="font-mono text-slate-800">{format(value)}</dd>
        </div>
      ))}
    </dl>
  )
}
