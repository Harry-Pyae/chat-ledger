const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

const buildPrompt = ({ customer, item, quantity, total }) => `You write payment reminder
messages for a small shop owner in Myanmar who sells to customers over Facebook
Messenger and Viber.

Write ONE short payment reminder in Burmese for this unpaid order:

- Customer: ${customer ?? 'unknown'}
- Item: ${item ?? 'unknown'}
- Quantity: ${quantity ?? 'unknown'}
- Amount owed: ${total ?? 'unknown'} MMK

Rules:
- Write in Burmese (Myanmar script).
- Sound like a real shop owner messaging a customer: warm, friendly, polite and casual.
  Not corporate, not formal, not a bank letter, not a legal notice.
- Keep it short, about one to three sentences.
- Mention the item and the amount owed so the customer knows what it is about.
- If the customer's name is known, address them naturally.
- Be gentle. Never threaten, never guilt, never demand. Assume they simply forgot.
- Do not mention any unknown field.
- Emoji are fine in moderation if it feels natural.

Return ONLY the message text itself. No translation, no explanation, no quotation marks,
no markdown, no alternatives to choose from.`

const jsonError = (message, status) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// The model sometimes wraps the reply in fences or quotes despite being told not to.
const cleanMessage = (raw) => {
  const fenced = raw.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/)
  return (fenced ? fenced[1] : raw).trim().replace(/^["']|["']$/g, '').trim()
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed. Use POST.', 405)
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return jsonError('GEMINI_API_KEY is not set on the server.', 500)
  }

  let order
  try {
    order = await req.json()
  } catch {
    return jsonError('Request body must be valid JSON.', 400)
  }

  const { customer, item, quantity, total } = order ?? {}
  if (item === undefined && total === undefined && customer === undefined) {
    return jsonError('No order details were provided.', 400)
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
        contents: [
          { parts: [{ text: buildPrompt({ customer, item, quantity, total }) }] },
        ],
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
  if (typeof reply !== 'string' || !reply.trim()) {
    const blockReason = payload?.promptFeedback?.blockReason
    return jsonError(
      blockReason
        ? `Gemini returned no content (blocked: ${blockReason}).`
        : 'Gemini returned no usable content.',
      502,
    )
  }

  return new Response(JSON.stringify({ message: cleanMessage(reply) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
