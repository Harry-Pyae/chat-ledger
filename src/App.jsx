import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const TABS = [
  { id: 'extract', label: 'Extract' },
  { id: 'ledger', label: 'Ledger' },
]

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

// Only figures the owner acts on get colour; the rest stay neutral so they recede.
const STAT_TONES = {
  neutral: 'text-slate-50',
  accent: 'text-emerald-400',
  warning: 'text-amber-400',
}

function StatCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-900/40 p-5 shadow-lg shadow-slate-950/40 transition-colors duration-200 hover:border-slate-700 sm:p-6 xl:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      {/* Sizes step down where the grid gets to five columns, so long values
          like "341,000 MMK" wrap to two lines at worst instead of clipping. */}
      <p
        className={`mt-3 line-clamp-2 break-words text-2xl font-semibold leading-snug tracking-tight sm:text-3xl lg:text-2xl xl:text-xl ${STAT_TONES[tone]}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-100 sm:text-xl">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-6 py-12 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-800 bg-slate-900">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-600" />
      </div>
      <p className="mt-4 text-base font-medium text-slate-200">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  )
}

function TabBar({ activeTab, onSelect }) {
  return (
    <div className="mt-8 flex w-full gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1 sm:inline-flex sm:w-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 sm:flex-none ${
            activeTab === tab.id
              ? 'bg-slate-800 text-slate-50 shadow-sm shadow-slate-950/50'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              activeTab === tab.id ? 'bg-emerald-400' : 'bg-transparent'
            }`}
          />
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function ExtractTab({
  messages,
  onMessagesChange,
  onExtract,
  extracting,
  draft,
  onSave,
  onDiscard,
  saving,
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/30 sm:p-7">
      <SectionHeading
        title="Extract orders from chat"
        description="Paste raw messages. Nothing is saved until you review and confirm."
      />

      <textarea
        value={messages}
        onChange={(event) => onMessagesChange(event.target.value)}
        rows={8}
        placeholder="Paste your Messenger or Viber messages here..."
        className="mt-5 w-full resize-y rounded-xl border border-slate-800 bg-slate-950 p-4 text-base leading-relaxed text-slate-100 transition-colors placeholder:text-slate-600 hover:border-slate-700 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 sm:text-sm sm:leading-loose"
      />

      <button
        type="button"
        onClick={onExtract}
        disabled={extracting || !messages.trim()}
        className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 sm:w-auto"
      >
        {extracting ? 'Reading messages...' : 'Extract Orders'}
      </button>

      {draft?.length ? (
        <div className="mt-7 rounded-xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-emerald-400">
              {draft.length}
            </span>
            <span className="text-sm font-medium text-slate-300">
              {draft.length === 1 ? 'order found' : 'orders found'}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            Review before saving. A dash means the message did not say.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-[11px] uppercase tracking-[0.14em] text-slate-500">
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
                  <tr key={index} className="transition-colors hover:bg-emerald-500/5">
                    <td className="px-3 py-2.5 font-medium text-slate-100">
                      {row.customer ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">{row.item ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-300">
                      {row.quantity ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-300">
                      {formatMMK(row.unit_price)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-100">
                      {formatMMK(row.total)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{row.area ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {row.paid ? 'Paid' : 'Unpaid'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {saving ? 'Saving...' : 'Save to Ledger'}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors duration-200 hover:border-slate-600 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60 disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function InsightsPanel({ onGenerate, generating, insights, hasOrders }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/30 sm:p-7">
      <SectionHeading
        title="AI Insights"
        description={
          hasOrders
            ? 'A quick read of your order book, in plain language.'
            : 'Save some orders first and there will be something to read.'
        }
        action={
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || !hasOrders}
            className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {generating ? 'Reading your numbers…' : 'Generate insights'}
          </button>
        }
      />

      {insights?.length ? (
        <ul className="mt-6 space-y-3">
          {insights.map((insight, index) => (
            <li
              key={index}
              className="flex gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-5"
            >
              <span className="text-xs font-semibold tabular-nums text-emerald-400">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="text-sm leading-relaxed text-slate-200">{insight}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-300">
            {generating ? 'Looking through your orders…' : 'Nothing read yet'}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
            {hasOrders
              ? 'Generate a short summary of what is selling, who owes you, and who keeps coming back.'
              : 'Your insights will appear here once there are orders to read.'}
          </p>
        </div>
      )}
    </section>
  )
}

function LedgerTab({
  orders,
  stats,
  loading,
  onTogglePaid,
  pendingId,
  onRemind,
  remindingId,
  onGenerateInsights,
  generatingInsights,
  insights,
}) {
  return (
    <div className="space-y-10 sm:space-y-12">
      <InsightsPanel
        onGenerate={onGenerateInsights}
        generating={generatingInsights}
        insights={insights}
        hasOrders={orders.length > 0}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Revenue" value={formatMMK(stats.revenue)} tone="accent" />
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
          tone="warning"
        />
        <StatCard
          label="Business Health"
          value={formatMMK(stats.averageOrder)}
          hint={`Average order · ${stats.repeatCustomers} repeat ${
            stats.repeatCustomers === 1 ? 'customer' : 'customers'
          }`}
        />
      </section>

      <section>
        <SectionHeading
          title="Orders"
          description="Every order, newest first. Tap a status to mark it paid."
        />

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg shadow-slate-950/30">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Unit Price</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-slate-500">
                    Loading orders…
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-5">
                    <EmptyState
                      title="No orders yet"
                      description="Head to the Extract tab and paste a few chat messages. Anything you save will show up here."
                    />
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="transition-colors duration-200 hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3.5 font-medium text-slate-100">
                      {order.customer}
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">{order.item}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-300">
                      {order.quantity}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-300">
                      {formatMMK(order.unit_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums font-medium text-slate-100">
                      {formatMMK(order.total)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400">{order.area}</td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => onTogglePaid(order)}
                        disabled={pendingId === order.id}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50 ${
                          order.paid
                            ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {order.paid ? 'Paid' : 'Unpaid'}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {order.paid ? null : (
                        <button
                          type="button"
                          onClick={() => onRemind(order)}
                          disabled={remindingId === order.id}
                          className="whitespace-nowrap rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors duration-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50"
                        >
                          {remindingId === order.id ? 'Writing…' : 'Remind'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState('extract')
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
  const [remindingId, setRemindingId] = useState(null)
  const [reminder, setReminder] = useState(null)
  const [copied, setCopied] = useState(false)
  const [insights, setInsights] = useState(null)
  const [generatingInsights, setGeneratingInsights] = useState(false)

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

    const ordersByCustomer = new Map()
    for (const order of orders) {
      // Names arrive from chat, so casing and stray spaces vary between messages.
      const customer = order.customer?.trim().toLowerCase()
      if (!customer) continue
      ordersByCustomer.set(customer, (ordersByCustomer.get(customer) ?? 0) + 1)
    }
    const repeatCustomers = [...ordersByCustomer.values()].filter(
      (count) => count > 1,
    ).length

    return {
      revenue,
      unpaid,
      topItem,
      topQuantity,
      count: orders.length,
      averageOrder: orders.length ? revenue / orders.length : 0,
      repeatCustomers,
    }
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
      setActiveTab('ledger')
    }
    setSaving(false)
  }

  const draftReminder = async (order) => {
    setRemindingId(order.id)
    setCopied(false)

    try {
      const response = await fetch('/.netlify/functions/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: order.customer,
          item: order.item,
          quantity: order.quantity,
          total: order.total,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload?.error ?? `Reminder failed (HTTP ${response.status}).`)
      } else {
        setError(null)
        setReminder({ order, message: payload.message })
      }
    } catch {
      setError(
        'Could not reach the reminder function. Are you running `netlify dev` instead of `npm run dev`?',
      )
    }

    setRemindingId(null)
  }

  const generateInsights = async () => {
    setGeneratingInsights(true)

    try {
      const response = await fetch('/.netlify/functions/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload?.error ?? `Insights failed (HTTP ${response.status}).`)
      } else {
        setError(null)
        setInsights(payload.insights)
      }
    } catch {
      setError(
        'Could not reach the insights function. Are you running `netlify dev` instead of `npm run dev`?',
      )
    }

    setGeneratingInsights(false)
  }

  const copyReminder = async () => {
    try {
      await navigator.clipboard.writeText(reminder.message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to the clipboard. Select the text and copy it manually.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <header className="border-l-2 border-emerald-500 pl-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl lg:text-5xl">
            Chat to Ledger
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-400">
            Turn everyday sales chatter into a clean, searchable order book.
          </p>
        </header>

        <TabBar activeTab={activeTab} onSelect={setActiveTab} />

        {error ? (
          <div className="mt-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-5">
            <p className="text-sm font-semibold text-rose-200">Something went wrong</p>
            <p className="mt-1.5 break-words text-sm leading-relaxed text-rose-200/70">
              {error}
            </p>
          </div>
        ) : null}

        {/* Keying on the tab remounts the panel, so the entrance animation replays. */}
        <div key={activeTab} className="tab-panel mt-8 sm:mt-10">
          {activeTab === 'extract' ? (
            <ExtractTab
              messages={messages}
              onMessagesChange={setMessages}
              onExtract={extractOrders}
              extracting={extracting}
              draft={draft}
              onSave={saveDraft}
              onDiscard={() => setDraft(null)}
              saving={saving}
            />
          ) : (
            <LedgerTab
              orders={orders}
              stats={stats}
              loading={loading}
              onTogglePaid={togglePaid}
              pendingId={pendingId}
              onRemind={draftReminder}
              remindingId={remindingId}
              onGenerateInsights={generateInsights}
              generatingInsights={generatingInsights}
              insights={insights}
            />
          )}
        </div>
      </div>

      {reminder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:p-6"
          onClick={() => setReminder(null)}
        >
          <div
            className="tab-panel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/60 sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-100">
                  Payment reminder
                </h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  {reminder.order.customer ?? 'Customer'} ·{' '}
                  {formatMMK(reminder.order.total)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReminder(null)}
                className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-400 transition-colors duration-200 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
              >
                Close
              </button>
            </div>

            {/* Burmese needs a larger size and looser leading than Latin to stay legible. */}
            <p className="mt-5 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-5 text-base leading-loose text-slate-100">
              {reminder.message}
            </p>

            <button
              type="button"
              onClick={copyReminder}
              className="mt-5 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 sm:w-auto"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
