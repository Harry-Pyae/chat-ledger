import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const TABS = [
  { id: 'extract', label: 'Extract' },
  { id: 'ledger', label: 'Ledger' },
]

const THEMES = [
  { id: 'dark', label: 'Dark', title: 'Always dark' },
  { id: 'light', label: 'Light', title: 'Always light' },
  { id: 'system', label: 'System', title: 'Follow your device setting' },
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

const iconProps = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  className: 'h-3.5 w-3.5 shrink-0',
}

const CheckIcon = () => (
  <svg {...iconProps}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
)

const ClockIcon = () => (
  <svg {...iconProps}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 4.75V8l2.25 1.5" />
  </svg>
)

const MessageIcon = () => (
  <svg {...iconProps}>
    <path d="M13.5 10.5a1.5 1.5 0 01-1.5 1.5H7l-3 2.5V12H4a1.5 1.5 0 01-1.5-1.5v-6A1.5 1.5 0 014 3h8a1.5 1.5 0 011.5 1.5z" />
  </svg>
)

// Only figures the owner acts on get colour; the rest stay neutral so they recede.
const STAT_TONES = {
  neutral: 'text-slate-900 dark:text-slate-50',
  accent: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
}

function StatCard({ label, value, hint, tone = 'neutral' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-100/70 p-6 shadow-md shadow-slate-900/10 transition duration-200 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/10 sm:p-7 xl:p-5 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/40 dark:shadow-slate-950/40 dark:hover:border-slate-700 dark:hover:shadow-slate-950/40">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
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
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl dark:text-slate-100">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-prose break-words text-sm leading-relaxed text-slate-500 dark:text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-600"
        />
      </div>
      <p className="mt-4 text-base font-medium text-slate-800 dark:text-slate-200">
        {title}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-500">
        {description}
      </p>
    </div>
  )
}

function TabBar({ activeTab, onSelect }) {
  return (
    <div className="mt-8 flex w-full gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:inline-flex sm:w-auto dark:border-slate-800 dark:bg-slate-900/60">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 sm:flex-none sm:px-5 ${
            activeTab === tab.id
              ? 'bg-white text-slate-900 shadow-sm shadow-slate-900/10 dark:bg-slate-800 dark:text-slate-50 dark:shadow-slate-950/50'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              activeTab === tab.id
                ? 'bg-emerald-500 dark:bg-emerald-400'
                : 'bg-transparent'
            }`}
          />
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function ThemeSwitcher({ theme, onSelect }) {
  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900/60"
    >
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          aria-pressed={theme === option.id}
          title={option.title}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
            theme === option.id
              ? 'bg-white text-slate-900 shadow-sm shadow-slate-900/10 dark:bg-slate-800 dark:text-slate-50 dark:shadow-slate-950/50'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
          }`}
        >
          {option.label}
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
  onCustomerChange,
  saving,
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 sm:p-8 dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-slate-950/30 dark:ring-0">
      <SectionHeading
        title="Extract orders from chat"
        description="Paste raw messages from any app. Nothing is saved until you review and confirm."
      />

      <textarea
        value={messages}
        onChange={(event) => onMessagesChange(event.target.value)}
        rows={8}
        placeholder="Paste your Messenger, Viber or Telegram messages here — with or without speaker names..."
        className="mt-5 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-4 text-base leading-relaxed text-slate-900 transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 sm:text-sm sm:leading-loose dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:hover:border-slate-700"
      />

      <button
        type="button"
        onClick={onExtract}
        disabled={extracting || !messages.trim()}
        className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:w-auto dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
      >
        {extracting ? 'Reading messages...' : 'Extract Orders'}
      </button>

      {draft?.length ? (
        <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
              {draft.length}
            </span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {draft.length === 1 ? 'order found' : 'orders found'}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-500">
            Review before saving. A dash means the message did not say. Add any missing
            customer names, or leave them blank.
          </p>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:text-slate-500">
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
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {draft.map((row, index) => (
                  <tr key={index} className="transition-colors hover:bg-emerald-500/5">
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {row.needsName ? (
                        <input
                          type="text"
                          value={row.customer ?? ''}
                          onChange={(event) => onCustomerChange(index, event.target.value)}
                          placeholder="Add name"
                          aria-label={`Customer name for order ${index + 1}`}
                          className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal text-slate-900 transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 sm:w-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:hover:border-slate-600"
                        />
                      ) : (
                        row.customer
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {row.item ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {row.quantity ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMMK(row.unit_price)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">
                      {formatMMK(row.total)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                      {row.area ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
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
              className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700"
            >
              {saving ? 'Saving...' : 'Save to Ledger'}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-200 hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 sm:p-8 dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-slate-950/30 dark:ring-0">
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
            className="w-full shrink-0 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 sm:w-auto dark:disabled:bg-slate-800"
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
              className="flex gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/60"
            >
              <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {String(index + 1).padStart(2, '0')}
              </span>
              {/* Burmese runs without spaces, so long strings need an explicit break. */}
              <p className="min-w-0 break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {insight}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-center dark:border-slate-800 dark:bg-slate-950/40">
          <p className="text-sm text-slate-500 dark:text-slate-500">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {generating ? 'Looking through your orders…' : 'Nothing read yet.'}
            </span>{' '}
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
  visibleOrders,
  query,
  onQueryChange,
  stats,
  loading,
  onTogglePaid,
  pendingId,
  onRemind,
  remindingId,
  onGenerateInsights,
  generatingInsights,
  insights,
  editingCustomerId,
  customerValue,
  onCustomerEditStart,
  onCustomerEditChange,
  onCustomerCommit,
  onCustomerCancel,
}) {
  const searching = query.trim().length > 0
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      <div className="pb-12 sm:pb-16">
        <InsightsPanel
          onGenerate={onGenerateInsights}
          generating={generatingInsights}
          insights={insights}
          hasOrders={orders.length > 0}
        />
      </div>

      <section className="grid grid-cols-1 gap-4 py-12 sm:grid-cols-2 sm:gap-5 sm:py-16 lg:grid-cols-3 xl:grid-cols-5">
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

      <section className="pt-12 sm:pt-16">
        <SectionHeading
          title="Orders"
          description={
            searching
              ? `${visibleOrders.length} of ${orders.length} ${
                  orders.length === 1 ? 'order' : 'orders'
                } match “${query.trim()}”`
              : 'Every order, newest first. Tap a status to mark it paid.'
          }
          action={
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search customer, item or area"
              aria-label="Search orders"
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 sm:w-72 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:hover:border-slate-700"
            />
          }
        />

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-slate-950/30 dark:ring-0">
          {/* relative keeps absolutely positioned descendants (the sr-only label
              below) inside this scroller instead of the initial containing block,
              where they would widen the whole document. */}
          <div className="relative overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Unit Price</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="relative px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
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
              ) : visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-5">
                    <EmptyState
                      title="No matching orders"
                      description="Nothing here matches that search. Try a customer name, an item or an area."
                    />
                  </td>
                </tr>
              ) : (
                visibleOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                      {editingCustomerId === order.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={customerValue}
                          onChange={(event) => onCustomerEditChange(event.target.value)}
                          onBlur={() => onCustomerCommit(order)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') onCustomerCommit(order)
                            else if (event.key === 'Escape') onCustomerCancel()
                          }}
                          placeholder="Add name"
                          aria-label="Customer name"
                          className="w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onCustomerEditStart(order)}
                          className="rounded-lg px-2 py-1 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:hover:bg-slate-800"
                        >
                          {order.customer ?? (
                            <span className="font-normal text-slate-400 dark:text-slate-600">
                              Add name
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                      {order.item}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {order.quantity}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMMK(order.unit_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {formatMMK(order.total)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400">
                      {order.area}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => onTogglePaid(order)}
                        disabled={pendingId === order.id}
                        title={order.paid ? 'Mark as unpaid' : 'Mark as paid'}
                        // Hovering previews the opposite state, so the pill reads as a toggle.
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 disabled:opacity-50 ${
                          order.paid
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/30 hover:bg-slate-100 hover:text-slate-600 hover:ring-slate-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/40 dark:hover:bg-slate-800 dark:hover:text-slate-300 dark:hover:ring-slate-600'
                            : 'bg-amber-50 text-amber-700 ring-amber-600/30 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-600/30 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300 dark:hover:ring-emerald-500/40'
                        }`}
                      >
                        {order.paid ? <CheckIcon /> : <ClockIcon />}
                        {order.paid ? 'Paid' : 'Unpaid'}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {order.paid ? null : (
                        <button
                          type="button"
                          onClick={() => onRemind(order)}
                          disabled={remindingId === order.id}
                          title="Draft a payment reminder"
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors duration-200 hover:border-emerald-500/40 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                        >
                          <MessageIcon />
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
  const [query, setQuery] = useState('')
  const [editingCustomerId, setEditingCustomerId] = useState(null)
  const [customerValue, setCustomerValue] = useState('')
  const [theme, setTheme] = useState('dark')
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  )

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = (event) => setSystemPrefersDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark)

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

  // Search only narrows the table; the stat cards stay on the full order list.
  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return orders

    return orders.filter((order) =>
      [order.customer, order.item, order.area].some((field) =>
        String(field ?? '').toLowerCase().includes(needle),
      ),
    )
  }, [orders, query])

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

  const startEditingCustomer = (order) => {
    setEditingCustomerId(order.id)
    setCustomerValue(order.customer ?? '')
  }

  const cancelEditingCustomer = () => {
    setEditingCustomerId(null)
    setCustomerValue('')
  }

  const commitCustomer = async (order) => {
    if (!supabase) return

    const trimmed = customerValue.trim()
    const nextCustomer = trimmed || null
    const previousCustomer = order.customer ?? null

    setEditingCustomerId(null)
    setCustomerValue('')
    // Enter closes the input, which also fires blur; skip the second, identical write.
    if (nextCustomer === previousCustomer) return

    setOrders((current) =>
      current.map((row) =>
        row.id === order.id ? { ...row, customer: nextCustomer } : row,
      ),
    )

    const { error: updateError } = await supabase
      .from('orders')
      .update({ customer: nextCustomer })
      .eq('id', order.id)

    if (updateError) {
      setError(updateError.message)
      setOrders((current) =>
        current.map((row) =>
          row.id === order.id ? { ...row, customer: previousCustomer } : row,
        ),
      )
    } else {
      setError(null)
    }
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
        setDraft(
          payload.map((row) => {
            const order = toOrderRow(row)
            // Rows the model could not name get a text input in the preview.
            return { ...order, needsName: order.customer === null }
          }),
        )
      }
    } catch {
      setError(
        'Could not reach the extraction function. Are you running `netlify dev` instead of `npm run dev`?',
      )
    }

    setExtracting(false)
  }

  const updateDraftCustomer = (index, value) => {
    setDraft((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, customer: value } : row,
      ),
    )
  }

  const saveDraft = async () => {
    if (!supabase || !draft?.length) return
    setSaving(true)

    // needsName is preview-only, and a name left blank stays null.
    const rows = draft.map(({ needsName, ...row }) => ({
      ...row,
      customer: row.customer?.trim() ? row.customer.trim() : null,
    }))

    const { error: insertError } = await supabase.from('orders').insert(rows)

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
    <div
      className={`min-h-screen overflow-x-hidden bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-200 ${
        isDark ? 'dark' : ''
      }`}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <header className="border-l-2 border-emerald-500 pl-4 sm:pl-5">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-slate-50">
              Chat to Ledger
            </h1>
            <p className="mt-3 max-w-xl break-words text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
              Turn everyday sales chatter into a clean, searchable order book.
            </p>
          </header>
          <ThemeSwitcher theme={theme} onSelect={setTheme} />
        </div>

        <TabBar activeTab={activeTab} onSelect={setActiveTab} />

        {error ? (
          <div className="mt-8 rounded-xl border border-rose-300 bg-rose-50 p-5 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">
              Something went wrong
            </p>
            <p className="mt-1.5 break-words text-sm leading-relaxed text-rose-600 dark:text-rose-200/70">
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
              onCustomerChange={updateDraftCustomer}
              saving={saving}
            />
          ) : (
            <LedgerTab
              orders={orders}
              visibleOrders={visibleOrders}
              query={query}
              onQueryChange={setQuery}
              stats={stats}
              loading={loading}
              onTogglePaid={togglePaid}
              pendingId={pendingId}
              onRemind={draftReminder}
              remindingId={remindingId}
              onGenerateInsights={generateInsights}
              generatingInsights={generatingInsights}
              insights={insights}
              editingCustomerId={editingCustomerId}
              customerValue={customerValue}
              onCustomerEditStart={startEditingCustomer}
              onCustomerEditChange={setCustomerValue}
              onCustomerCommit={commitCustomer}
              onCustomerCancel={cancelEditingCustomer}
            />
          )}
        </div>
      </div>

      {reminder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6 dark:bg-slate-950/80"
          onClick={() => setReminder(null)}
        >
          <div
            className="tab-panel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20 sm:p-7 dark:border-slate-800 dark:bg-slate-900 dark:shadow-slate-950/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Payment reminder
                </h2>
                <p className="mt-1.5 break-words text-sm text-slate-500 dark:text-slate-500">
                  {reminder.order.customer ?? 'Customer'} ·{' '}
                  {formatMMK(reminder.order.total)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReminder(null)}
                className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                Close
              </button>
            </div>

            {/* Burmese needs a larger size and looser leading than Latin to stay legible. */}
            <p className="mt-5 whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-base leading-loose text-slate-900 sm:p-5 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
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
