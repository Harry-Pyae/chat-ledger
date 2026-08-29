const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

const buildPrompt = (text) => `You are a precise data extraction engine for a small business in Myanmar.

You will be given raw chat messages copied from Facebook Messenger, Viber, Telegram or
similar. The text is messy and may mix Burmese and English, contain typos, greetings,
small talk, timestamps, "Seen" markers, reactions, and several different customers in
one blob.

The paste format varies and you are NOT told which app it came from. Work out the
structure from the text itself:

- Some pastes label every message with a speaker name or "You:" before the text.
- Some pastes have no names at all, just consecutive lines of message text.
  Facebook Messenger commonly pastes this way.
- Some pastes mix both, or label only part of the conversation.

When speaker labels are missing, infer who is talking from the content and the natural
back and forth of a conversation. Consecutive lines usually alternate between the two
sides, but not always: one person often sends several short lines in a row before the
other replies. Use meaning, not line position alone.

Telling the two sides apart:
- The SELLER quotes prices, confirms stock, states delivery fees, gives payment details,
  confirms receipt of payment, and says things like "ok", "ရပါတယ်", "ပို့ပေးလိုက်မယ်".
- The CUSTOMER asks prices, places the order, states quantities, gives a delivery
  address or township, asks when it will arrive, and sends payment screenshots.
- Only the customer's orders count. Never create an order from the seller's own messages.

Read it as one continuous thread, not as separate lines:
- Real conversations are not one message per turn. One person often sends several
  messages in a row before the other replies. Never assume a line is a complete
  exchange on its own.
- Details of a single order are usually spread across many messages. The item may be
  named in one line, the quantity agreed several lines later, the price quoted after
  that, and the delivery address later still. Gather all of it into ONE order object.
- A price, quantity or address mentioned later still belongs to the item under
  discussion, even if unrelated chatter sits in between. Follow the topic, not the
  line order.
- Start a new order object only when the conversation genuinely moves to a different
  item or a different buyer, not merely because a new message begins.
- Corrections replace earlier values. If a customer says two and then changes to three,
  the quantity is three.
- Greetings, small talk, thanks, stickers, and questions that were never answered or
  acted on are not orders. A customer merely asking a price, with no order placed, is
  not an order.

Names:
- Use a name as "customer" only when the text actually shows the buyer's name, for
  example a speaker label on the buyer's messages, or the buyer stating their own name.
- Never use the seller's name or "You" as the customer.
- Do not guess a name from greetings or honorifics alone, and never carry a name over
  from a different conversation in the same paste.
- If the buyer's name is genuinely not in the text, set "customer" to null. A null
  name is correct and expected for pastes with no speaker labels.

Extract every distinct order into a JSON array. Each element must be an object with
exactly these keys:

- "customer": the buyer's name as written in the text, or null if it is not there
- "item": the product ordered, or null
- "quantity": a number, or null
- "unit_price": price per single unit as a number, or null
- "total": the order total as a number, or null
- "area": delivery township, city, or area, or null
- "paid": boolean

Rules:
- One object per distinct order. If one customer orders two different items, that is two objects.
- Ignore timestamps, dates, "Seen", "Sent", delivered markers, reactions and forwarded
  headers. They are paste artefacts, not order details.
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
