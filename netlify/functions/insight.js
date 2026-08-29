const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

// Keeps the prompt small and drops columns the model has no use for.
const MAX_ORDERS = 200

const compactOrders = (orders) =>
  orders.slice(0, MAX_ORDERS).map((order) => ({
    customer: order?.customer ?? null,
    item: order?.item ?? null,
    quantity: order?.quantity ?? null,
    unit_price: order?.unit_price ?? null,
    total: order?.total ?? null,
    area: order?.area ?? null,
    paid: Boolean(order?.paid),
  }))

const buildPrompt = (orders) => `You are helping the owner of a small shop in Myanmar
understand their own sales. Below is their order book as JSON. All money is in MMK.

${JSON.stringify(compactOrders(orders))}

Write 2 to 3 short observations the owner could act on today. Good things to look at:
- which item sells best, and whether that is worth stocking more of
- money still owed and who owes it
- customers who ordered more than once and are worth looking after
- anything else genuinely notable in these numbers, such as a strong area
  or an unusually large unpaid order

Rules:
- Base every observation on the data above. Never invent numbers, names or items.
- Be specific. Name the item, the customer or the amount you are talking about.
- Plain everyday English. No business jargon, no buzzwords, no consultant language.
- No generic advice that would be true for any shop, such as "focus on customer
  service" or "consider marketing". If the data does not support a point, leave it out.
- One or two sentences each. Write to the owner as "you".
- Write amounts with thousand separators and the suffix MMK, for example 24,000 MMK.

Return ONLY a raw JSON array of strings, for example ["...", "..."].
No prose, no explanation, no markdown code fences.`

const jsonError = (message, status) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// The model is told not to use fences, but it does anyway often enough to matter.
const stripFences = (raw) => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return (fenced ? fenced[1] : raw).trim()
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed. Use POST.', 405)
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return jsonError('GEMINI_API_KEY is not set on the server.', 500)
  }

  let body
  try {
    body = await req.json()
  } catch {
    return jsonError('Request body must be valid JSON.', 400)
  }

  const orders = Array.isArray(body) ? body : body?.orders
  if (!Array.isArray(orders) || orders.length === 0) {
    return jsonError('There are no orders to look at yet.', 400)
  }

  let response
  try {
    response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(orders) }] }],
      }),
    })
  } catch {
    return jsonError('Could not reach the Gemini API. Check your connection.', 502)
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return jsonError('The Gemini API returned a response that was not JSON.', 502)
  }

  if (!response.ok) {
    const detail = payload?.error?.message ?? `HTTP ${response.status}`
    return jsonError(`Gemini API error: ${detail}`, response.status)
  }

  const reply = payload?.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof reply !== 'string') {
    const blockReason = payload?.promptFeedback?.blockReason
    return jsonError(
      blockReason
        ? `Gemini returned no content (blocked: ${blockReason}).`
        : 'Gemini returned no usable content.',
      502,
    )
  }

  let insights
  try {
    insights = JSON.parse(stripFences(reply))
  } catch {
    return jsonError('Gemini did not return valid JSON. Try again.', 502)
  }

  if (!Array.isArray(insights)) {
    insights = [insights]
  }

  insights = insights
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim()))
    .filter(Boolean)

  if (insights.length === 0) {
    return jsonError('Gemini did not return any insights. Try again.', 502)
  }

  return new Response(JSON.stringify({ insights }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
