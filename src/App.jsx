import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const formatMMK = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  )} MMK`
}

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// Gemini can return extra keys or strings where numbers belong; Postgres will not.
const toOrderRow = (row) => {
  const quantity = toNumber(row.quantity)
  const unitPrice = toNumber(row.unit_price)
  const total = toNumber(row.total)

  return {
    customer: row.customer ?? null,
    item: row.item ?? null,
    quantity,
    unit_price: unitPrice,
    total: total ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : null),
    area: row.area ?? null,
    paid: Boolean(row.paid),
  }
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-2 truncate text-2xl font-semibold text-slate-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function App() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(
    isSupabaseConfigured
      ? null
      : 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local and restart the dev server.',
  )
  const [pendingId, setPendingId] = useState(null)
  const [messages, setMessages] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchOrders = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setError(null)
      setOrders(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const stats = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
    const unpaid = orders
      .filter((order) => !order.paid)
      .reduce((sum, order) => sum + (Number(order.total) || 0), 0)

    const quantityByItem = new Map()
    for (const order of orders) {
      const item = order.item ?? 'Unknown'
      quantityByItem.set(
        item,
        (quantityByItem.get(item) ?? 0) + (Number(order.quantity) || 0),
      )
    }
    const [topItem, topQuantity] = [...quantityByItem.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0] ?? [null, 0]

    return { revenue, unpaid, topItem, topQuantity, count: orders.length }
  }, [orders])

  const togglePaid = async (order) => {
    if (!supabase) return
    const nextPaid = !order.paid

    setPendingId(order.id)
    setOrders((current) =>
      current.map((row) => (row.id === order.id ? { ...row, paid: nextPaid } : row)),
    )

    const { error: updateError } = await supabase
      .from('orders')
      .update({ paid: nextPaid })
      .eq('id', order.id)

    if (updateError) {
      setError(updateError.message)
      setOrders((current) =>
        current.map((row) =>
          row.id === order.id ? { ...row, paid: order.paid } : row,
        ),
      )
    } else {
      setError(null)
    }
    setPendingId(null)
  }

  const extractOrders = async () => {
    setExtracting(true)
    setDraft(null)

    try {
      const response = await fetch('/.netlify/functions/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messages }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload?.error ?? `Extraction failed (HTTP ${response.status}).`)
      } else if (!Array.isArray(payload) || payload.length === 0) {
        setError('No orders were found in those messages.')
      } else {
        setError(null)
        setDraft(payload.map(toOrderRow))
      }
    } catch {
      setError(
        'Could not reach the extraction function. Are you running `netlify dev` instead of `npm run dev`?',
      )
    }

    setExtracting(false)
  }

  const saveDraft = async () => {
    if (!supabase || !draft?.length) return
    setSaving(true)

    const { error: insertError } = await supabase.from('orders').insert(draft)

    if (insertError) {
      setError(insertError.message)
    } else {
      setError(null)
      setDraft(null)
      setMessages('')
      await fetchOrders()
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-400 sm:text-4xl">
            Chat to Ledger
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Turn everyday sales chatter into a clean, searchable order book.
          </p>
        </header>

        {error ? (
          <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-300">Supabase error</p>
            <p className="mt-1 break-words text-sm text-red-200/80">{error}</p>
          </div>
        ) : null}

        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Extract orders from chat
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Paste raw messages. Nothing is saved until you review and confirm.
          </p>

          <textarea
            value={messages}
            onChange={(event) => setMessages(event.target.value)}
            rows={8}
            placeholder="Paste your Messenger or Viber messages here..."
            className="mt-4 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
          />

          <button
            type="button"
            onClick={extractOrders}
            disabled={extracting || !messages.trim()}
            className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {extracting ? 'Reading messages...' : 'Extract Orders'}
          </button>

          {draft?.length ? (
            <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-sm font-medium text-emerald-300">
                Found {draft.length} {draft.length === 1 ? 'order' : 'orders'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Review before saving. A dash means the message did not say.
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Customer</th>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Area</th>
                      <th className="px-3 py-2 font-medium">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {draft.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-slate-100">
                          {row.customer ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-300">{row.item ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                          {row.quantity ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                          {formatMMK(row.unit_price)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                          {formatMMK(row.total)}
                        </td>
                        <td className="px-3 py-2 text-slate-400">{row.area ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-300">
                          {row.paid ? 'Paid' : 'Unpaid'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={saving}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {saving ? 'Saving...' : 'Save to Ledger'}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Revenue" value={formatMMK(stats.revenue)} />
          <StatCard label="Orders" value={stats.count} />
          <StatCard
            label="Top Product"
            value={stats.topItem ?? '—'}
            hint={stats.topItem ? `${stats.topQuantity} sold` : undefined}
          />
          <StatCard
            label="Unpaid Amount"
            value={formatMMK(stats.unpaid)}
            hint={`${orders.filter((order) => !order.paid).length} unpaid orders`}
          />
        </section>

        <section className="mt-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Unit Price</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Loading orders…
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center">
                      <p className="text-base font-medium text-slate-300">
                        No orders yet
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Paste some chat messages above to get started.
                      </p>
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="transition hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-100">
                        {order.customer}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{order.item}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                        {order.quantity}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                        {formatMMK(order.unit_price)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-100">
                        {formatMMK(order.total)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{order.area}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => togglePaid(order)}
                          disabled={pendingId === order.id}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                            order.paid
                              ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {order.paid ? 'Paid' : 'Unpaid'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
