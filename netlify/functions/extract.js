const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

const buildPrompt = (text) => `You are a precise data extraction engine for a small business in Myanmar.

You will be given raw customer chat messages copied from Facebook Messenger or Viber.
The text is messy and may mix Burmese and English, contain typos, greetings, small talk,
and several different customers in one blob.

Extract every distinct order into a JSON array. Each element must be an object with
exactly these keys:

- "customer": the buyer's name as written, or null
- "item": the product ordered, or null
- "quantity": a number, or null
- "unit_price": price per single unit as a number, or null
- "total": the order total as a number, or null
- "area": delivery township, city, or area, or null
- "paid": boolean

Rules:
- One object per distinct order. If one customer orders two different items, that is two objects.
- If total is not stated but quantity and unit_price are both known, set total to quantity * unit_price.
- If unit_price is not stated but total and quantity are both known, set unit_price to total / quantity.
- Use null for any field that is genuinely unknown. Never invent or guess a value.
- Numbers must be plain numbers with no currency symbols, no commas, and no units.
- Set "paid" to true only when payment is clearly confirmed (for example a transfer
  screenshot is mentioned, or the customer says they have paid or transferred).
  Anything else, including promises to pay later or cash on delivery, is false.
- If the text contains no orders at all, return an empty array.

Return ONLY the raw JSON array. No prose, no explanation, no markdown code fences.

Messages:
"""
${text}
"""`

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

  let text
  try {
    ({ text } = await req.json())
  } catch {
    return jsonError('Request body must be valid JSON.', 400)
  }

  if (typeof text !== 'string' || !text.trim()) {
    return jsonError('No message text was provided.', 400)
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
        contents: [{ parts: [{ text: buildPrompt(text) }] }],
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

  let orders
  try {
    orders = JSON.parse(stripFences(reply))
  } catch {
    return jsonError('Gemini did not return valid JSON. Try rephrasing the messages.', 502)
  }

  if (!Array.isArray(orders)) {
    orders = [orders]
  }

  return new Response(JSON.stringify(orders), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
