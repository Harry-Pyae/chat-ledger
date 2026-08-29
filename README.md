# Chat to Ledger

**AI order book for Myanmar SMEs.** Paste your Messenger or Viber chat, get a structured sales ledger.

Built for the **Cursor Myanmar AI Hackathon 2026** — uab Bank topic, *AI for SMEs & Entrepreneurs*.

**Live demo:** https://chat-ledger.netlify.app

---

## The problem

Most Myanmar SMEs sell through chat. Facebook accounts for roughly 85% of the country's internet traffic, and formal e-commerce is a rounding error next to a $10–12 billion retail market that runs informally through Messenger, Viber and comment threads.

So orders arrive as messages, and nothing records them. The sale happens; the record never does.

These businesses can't answer basic questions about themselves — what sells best, who owes money, what they earned last week. Not because the analysis is hard, but because the data was never captured.

That gap also keeps them outside the banking system. **No records means no credit assessment, which means no loan.**

## The solution

The seller pastes their day's messages. Gemini reads the conversation as a thread and extracts each order — customer, item, quantity, unit price, total, delivery area, payment status. The seller reviews the rows before anything is saved, then gets a live dashboard.

Chat history becomes an order book.

---

## Features

### AI order extraction

The core feature. Raw chat in, structured rows out.

- Handles **mixed Burmese and English** in the same conversation
- Works **with or without speaker names** — Messenger pastes without them, so it infers who's speaking from context
- **Groups details scattered across multiple messages** into a single order; a price stated six lines after the item still attaches to it
- Applies **later corrections over earlier ones** ("two — actually make it three")
- Ignores greetings, small talk, and price questions that never became orders
- Returns `null` rather than inventing a value it can't support from the text

### Review before save

Nothing reaches the database unconfirmed. Extracted rows appear in a preview table first. Orders where the chat never stated a customer name show an editable field, so the seller can fill in what the AI honestly couldn't determine.

### Ledger dashboard

Total revenue, order count, top product, outstanding receivables, and business health (average order value and repeat customer count). Search across customer, item and area. One-tap paid/unpaid toggle. Editable customer names on saved rows.

### AI payment reminders

Drafts a short, warm reminder **in Burmese** for any unpaid order, written the way a shop owner would actually send it on Messenger rather than in corporate language.

### AI business insights

Reads the whole order book and returns two or three specific, actionable observations. Real output from the demo data:

> Ko Zaw is your biggest customer with 204,000 MMK in total orders, but he still owes you 136,000 MMK for his second order of 2 rice bags. You should reach out to him today to collect this payment.

---

## Why the AI matters

Remove the AI and this product doesn't get worse — it becomes impossible. Nothing else converts freeform bilingual chat into queryable rows.

This is not a chatbot wrapper. The AI performs data entry that would otherwise never happen, which is precisely why these businesses have no records in the first place.

## Why a bank should care

An order book isn't just convenience. It's the first structured financial record these businesses have ever produced — revenue history, repeat customer counts, outstanding receivables, average order value.

Those are exactly the inputs a lender needs. A shop that could never be underwritten now generates the evidence to be underwritten, as a side effect of something the owner wanted anyway.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Styling | Tailwind CSS v4 |
| Database | Supabase (Postgres with Row Level Security) |
| AI | Google Gemini (`gemini-3.6-flash`) |
| Serverless | Netlify Functions |
| Hosting & CI/CD | Netlify, auto-deploy from GitHub |

All three AI features run through Netlify Functions, so the Gemini API key stays server-side and never reaches the browser.

---

## Running locally

### Prerequisites

- Node.js 20.19+ or 22.12+
- A Supabase project
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Netlify CLI (`npm install -g netlify-cli`)

### Setup

```bash
git clone https://github.com/Harry-Pyae/chat-ledger.git
cd chat-ledger
npm install
```

Create `.env.local` in the project root:

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-key
GEMINI_API_KEY=your-gemini-api-key
```

The `VITE_` prefixed variables are exposed to the browser, which is safe for the Supabase publishable key because RLS policies guard the data. `GEMINI_API_KEY` has no prefix deliberately — only the serverless functions read it.

### Database

Run this in the Supabase SQL Editor:

```sql
create table orders (
  id bigint primary key generated always as identity,
  customer text,
  item text,
  quantity numeric,
  unit_price numeric,
  total numeric,
  area text,
  paid boolean default false,
  created_at timestamptz default now()
);

alter table orders enable row level security;

create policy "public access" on orders
  for all using (true) with check (true);
```

The RLS policy is deliberately open for demo purposes. A production deployment would scope policies to authenticated users.

### Run

```bash
netlify dev
```

Use the URL it prints, typically `http://localhost:8888`. Plain `npm run dev` won't work — Vite alone doesn't serve the serverless functions the AI features depend on.

---

## Project structure

```
netlify/functions/
  extract.js     order extraction from raw chat
  remind.js      Burmese payment reminder drafting
  insight.js     business insights from the order book
src/
  lib/supabase.js
  App.jsx
netlify.toml
```

---

## How this was built

Built solo in roughly three hours during the hackathon build window.

**Cursor's agent wrote the implementation.** Each feature was directed prompt by prompt and verified before moving on, which is visible in the commit history: scaffold, Supabase integration, extraction function and prompt, reminder and insights functions, tab split, responsive fixes.

One example of Cursor doing more than code generation: a horizontal overflow bug on mobile resisted several attempted fixes. Cursor diagnosed it by measuring `scrollWidth` across elements and traced it to a Tailwind `sr-only` span escaping its overflow container because no ancestor had `position: relative`. Two-line fix.

**Claude** was used for planning and prompt engineering — evaluating the three hackathon topics against the scoring criteria, scoping the MVP to fit the build window, writing the Cursor prompts, and debugging (a Gemini 404 turned out to be a retired model name rather than a bad key).

---

## Roadmap

- **Voice note input** for owners who would rather speak than type
- **Direct Messenger integration** so orders are captured as they're agreed, with no pasting
- **Burmese interface** — the product is already Burmese-native in what it reads and writes; the UI is next
- **Export for loan applications** — turn the ledger into something a bank can actually accept

---

## License

MIT
