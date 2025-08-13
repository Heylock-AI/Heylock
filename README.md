# Heylock

> Zero‑friction AI agent integration for JavaScript & TypeScript projects.

<!-- Badges -->
<p align="left">
	<a href="https://www.npmjs.com/package/heylock"><img src="https://img.shields.io/npm/v/heylock?color=3178c6&label=npm%20version" alt="npm version" /></a>
	<a href="https://www.npmjs.com/package/heylock"><img src="https://img.shields.io/npm/dm/heylock.svg?color=blue" alt="npm downloads" /></a>
	<img src="https://img.shields.io/badge/Types-Included-success" alt="types included" />
	<img src="https://img.shields.io/badge/Module-ESM_only-orange" alt="esm only" />
	<a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-lightgrey.svg" alt="license" /></a>
</p>

## Table of Contents
- [Overview](#overview)
- [Features](#features)
	- [Developer Gains at a Glance](#developer-gains-at-a-glance)
- [Registration & Prerequisites](#registration--prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Concepts](#concepts)
- [Usage Guide](#usage-guide)
	- [1. Initialization & Lifecycle](#1-initialization--lifecycle)
	- [2. Context Management](#2-context-management)
	- [3. Message History](#3-message-history)
	- [4. Sending Messages](#4-sending-messages)
	- [5. Greeting](#5-greeting)
	- [6. Engagement Decision](#6-engagement-decision)
	- [7. Rewrite](#7-rewrite)
	- [8. Sort](#8-sort)
	- [9. Usage Limits](#9-usage-limits)
- [Configuration & Options](#configuration--options)
- [Best Practices](#best-practices)
	- [Writing Good Context Entries](#writing-good-context-entries)
	- [Minimizing Sensitive Data Exposure](#minimizing-sensitive-data-exposure)
	- [Streaming UI Pattern](#streaming-ui-pattern)
	- [Handling Fallbacks & Warnings](#handling-fallbacks--warnings)
	- [Engagement Throttling Recommendations](#engagement-throttling-recommendations)
	- [Retry & Backoff Strategy](#retry--backoff-strategy)
	- [Efficient Context Lifecycle](#efficient-context-lifecycle)
	- [Server vs Browser Separation](#server-vs-browser-separation)
	- [Using `rewrite` Safely](#using-rewrite-safely)
	- [Sorting for Personalization](#sorting-for-personalization)
	- [LocalStorage Hygiene (when `useStorage` true)](#localstorage-hygiene-when-usestorage-true)
	- [Defensive UI States](#defensive-ui-states)
	- [Graceful Degradation](#graceful-degradation)
	- [Internationalization](#internationalization)
	- [Cleaning / Resetting Sessions](#cleaning--resetting-sessions)
	- [Multi-Agent Architecture](#multi-agent-architecture)
- [Troubleshooting / FAQ](#troubleshooting--faq)
- [Security Notes](#security-notes)
- [License](#license)
- [Support](#support)


## Overview

Heylock makes your app super smart, super fast. It’s like entroducing magic to your code!

- Remembers what people do and say (so you don’t have to)
- Talks back to users, like a real chat buddy
- Helps you sort stuff (literally anything) and fix words to sound better
- Knows when to pop up and engage a prospect
- Shows answers as they come in, not all at once
- And it's very easy to use

You just set up your agent in the Heylock website, then use this package to make your app awesome. No hard work. No boring code. Just plug it in and look smart.

Why use Heylock?
- You get all the cool features with almost no work
- It saves you hours (maybe days!)
- Your users will think you’re a genius

Don’t use the old, hard way. Use Heylock and make your app amazing!

## Features

See what you get in minutes (not days) — these ship out‑of‑the‑box so you write product, not glue. Each one is about faster build, higher conversions, smarter UX.

- 💬 Message (`message`) – Create AI chat in minutes. 
- 🔄 Streaming (`messageStream`) – Token‑by‑token replies for "instant" feel. Users stay engaged; bounce drops.
- 👋 Greeting (`greet`) – Tailored first message so prospects are more likely to engage.
- 🕵️ Engagement Brain (`shouldEngage`) – Asks “Should I pop up now?” with reasoning for debugging. Triggers at the right moment → more conversions, less annoyance.
- ✍️ Rewrite (`rewrite`) – Fix tone/grammar in one line. Use tailored copy.
- 📊 Sort (`sort`) – AI ranks any list (products, leads, docs, literally anything). Better ordering → more clicks.
- 🧠 Context Store – Log user actions to enable personalized experience on your website.
- 🗂️ Message History – Full chat transcript managed for you (modify / clear / stream updates).
- 🚦 Usage Limits (`fetchUsageRemaining`) – Know remaining quota early; hide buttons before errors.

Why you should care:
- ⚡ Integrate core agent features in under 5 minutes.
- 🛠️ Tailor your website’s experience for each user, so your site adapts to them in real time.
- 🧠 Your users will think you’re a genius for implementing all of this.

### Developer Gains at a Glance
* You don’t need to build: streaming parser, rate limiter, context store, chat log manager, AI sorter, rewrite tool. Just import and use.
* Make a real chat + smart features in minutes instead of days.
* Clear reasons (from sort & engage) help you tune and A/B test fast.
* Safety built in: input checks, defensive copies = fewer weird bugs.
* Start simple with `message()`.

## Registration & Prerequisites

1. Create an account at https://heylock.dev
2. Create an agent in the dashboard.
3. Configure personality and knowledge.
3. Generate the secret key.
5. Start using AI agents!

## Installation

Run this in your console.

```bash
npm install heylock
```

Runtime requirements:
- Node: >= 18 (for native `fetch` + modern syntax: private fields, optional chaining, async generators, nullish coalescing). For Node 16/14 add a fetch polyfill (`undici`) and ensure ES2020 support.
- Browser: Modern evergreen browsers (ES2020). LocalStorage features require a standard DOM environment.

## Quick Start

```ts
import Heylock from 'heylock';

const agent = new Heylock(process.env.HEYLOCK_AGENT_KEY, {
	useStorage: false,          // Set to false when running server-side
	useMessageHistory: true,
	suppressWarnings: false
});

agent.onInitialized(async (success) => {
	const reply = await agent.message('Hello, Heylock!');
    
	console.log('Agent:', reply);
});
```

Streaming example (progressive UI):

```ts
for await (const chunk of agent.messageStream('Explain this feature briefly.')) {
	process.stdout.write(chunk); // append to UI / console
}
```

## Concepts

| Concept | Summary |
|---------|---------|
| Agent | Your AI agent, set up in dashboard, used by key |
| Context | List of user actions for better replies |
| Message History | Chat log of user and assistant messages |
| Streaming | Get reply chunks as they arrive |
| Usage Limits | Shows how many AI actions you have left |
| Fallbacks | Returns partial results or warnings if needed |

## Usage Guide

### 1. Initialization & Lifecycle
- `new Heylock(agentKey, options)` — Starts the agent and checks your key.
- Use `onInitialized(callback)` or check `isInitialized` to run code when ready.

### 2. Context Management
- `addContextEntry(content, timestamp?)` — Add a new context fact. Timestamp is optional. 
- `modifyContextEntry(index, content, timestamp?)` — Change a context entry by its index.
- `removeContextEntry(index)` — Remove a context entry by its index.
- `clearContext()` — Remove all context entries.
- `getContextString()` — Get a human-readable summary of context.
- If `useStorage` is true in the browser, context is saved in localStorage.

### 3. Message History
- `addMessage(content, role?)` — Add a message to the chat log. Role is 'user' or 'assistant' (default: 'user').
- `modifyMessage(index, content, role?)` — Change a message by its index.
- `removeMessage(index)` — Remove a message by its index.
- `setMessageHistory(messages)` — Replace the whole chat log.
- `clearMessageHistory()` — Remove all messages from the chat log.
- `onMessageHistoryChange(callback)` — Run code when the chat log changes.

### 4. Sending Messages
- `message(content, useContext = true, saveToMessageHistory = true)` — Send a message to your agent and get the assistant’s reply as a string. If `saveToMessageHistory` is true, both your message and the reply are saved in the chat log.
- `messageStream(content, useContext = true, saveToMessageHistory = true)` — Stream the assistant’s reply in pieces (chunks) using an async generator. If `saveToMessageHistory` is true, the assistant’s message in the chat log is updated live as new chunks arrive.

### 5. Greeting
- `greet(instructions?, useContext = true, saveToMessageHistory = true)` — Get a friendly first message from the agent. Use `instructions` to guide the greeting.

### 6. Engagement Decision
- `shouldEngage(instructions?)` — Ask if the agent should pop up now. Returns `{ shouldEngage, reasoning, warning?, fallback }`. If you call this again within 15 seconds, you get a warning and fallback.

### 7. Rewrite
- `rewrite(content, instructions?, useContext = true)` — Fix or change text using AI. Use `instructions` to guide the rewrite.

### 8. Sort
- `sort(array, instructions?, useContext = true)` — AI sorts your array. Returns `{ array, indexes, reasoning?, warning?, fallback? }`. If sorting fails, you get the original array and `fallback: true`.

### 9. Usage Limits
- `fetchUsageRemaining()` — Check how many messages, sorts, and rewrites you have left.

## Type Definitions
Interfaces:
- `AgentOptions` (`useStorage`, `useMessageHistory`, `suppressWarnings`, `agentId`)
- `Message`
- `ContextEntry`
- `UsageRemaining`
- `ShouldEngageResult`
- `SortResult`

Core Class: `Heylock`
- Constructor
- Properties: `isInitialized`, `usageRemaining`, `messageHistory`, `context`
- Callbacks: `onInitialized`, `onMessageHistoryChange`, `onContextChange`
- Context methods
- Message history methods
- Message / streaming / greet
- Engagement / rewrite / sort / limits

## Configuration & Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useStorage` | boolean | auto (true in browser, false server) | Persist context to localStorage (browser only). |
| `useMessageHistory` | boolean | true | Maintain internal transcript. |
| `suppressWarnings` | boolean | false | Hide non-fatal console warnings (e.g., throttling, environment). |
| `agentId` | string | 'default' | Namespacing for multi-agent storage keys. |

Environment Behavior:
- Browser: If `useStorage` true, context persists (`heylock:<agentId>:context`).
- Server (Node): Storage APIs disabled; context only in memory.

## Best Practices

### Writing Good Context Entries
_Why: Focused, consistent context reduces prompt size and improves response relevance without noise._
- Use clear, short sentences that describe what the user did or what happened.
- Focus on actions or events that help the agent give better answers.
- Use past tense, and be specific.
- The agent will see entries as in `getContextString()` – "User did X _now_", "User did X _5 minutes ago_"

**Examples:**
- "User clicked the X button"
- "User opened brand tab"
- "User hovers the cursor over technical details"
- "User added item X to cart"
- "User switched to dark mode"

### Minimizing Sensitive Data Exposure
_Why: Reduces risk of data leaks, simplifies compliance (GDPR/CCPA), and limits blast radius if logs are compromised._
- Never add PII (emails, full names, addresses, secrets) to context or messages unless absolutely required.
- Prefer ephemeral user/event IDs over raw identifiers.
- Strip values before calling `addContextEntry()`.

TypeScript example (sanitizing):
```ts
function safeContextEvent(raw: { email?: string; action: string }) {
	const anon = raw.email ? raw.email.split('@')[0] : 'user';

	agent.addContextEntry(`${anon} ${raw.action}`); // no full email stored
}
```

### Streaming UI Pattern
_Why: Early incremental feedback lowers perceived latency and increases user engagement._
- Render partial chunks immediately for perceived speed.
- Keep a mutable buffer; only commit to history at the end (SDK does this if `saveToMessageHistory` true).
- Show a typing indicator while awaiting first chunk (set timeout >300ms to avoid flicker).

Example:
```ts
let buffer = '';
for await (const chunk of agent.messageStream(prompt)) {
	buffer += chunk;
	updateChatBubble(buffer);
}
```

### Handling Fallbacks & Warnings
_Why: Graceful degradation prevents hard failures and preserves UX while signaling issues for observability._
- Always check `fallback` / `warning` for non-fatal degradations.
- Log once; avoid noisy consoles in production by gating with `NODE_ENV`.

```ts
const result = await agent.sort(products, 'Rank by likelihood of purchase');

if (result.fallback) {
	// Use original order, maybe schedule retry with different arguments.
	console.warn('Sort fallback, using original array');
}
```

### Engagement Throttling Recommendations
_Why: Avoids spamming users and improves trust while still triggering help at high-intent moments._
- Call `shouldEngage()` on meaningful user intent (time-on-page > N seconds, scroll depth, idle detection) not every minor event.
- Respect `{ shouldEngage, reasoning }`; log sampled reasoning for tuning.

```ts
const { shouldEngage, reasoning } = await agent.shouldEngage();

if (shouldEngage === true){ 
    openChat();
} else{ 
    debugSample(reasoning);
}
```

### Retry & Backoff Strategy
_Why: Mitigates transient network/service hiccups without amplifying load or causing duplicate side effects._
- Network/transient errors: retry idempotent methods (`message`, `rewrite`, `sort`) with exponential backoff (e.g., 250ms * 2^n, max ~3 retries).
- Do not retry `shouldEngage()` inside cooldown window.

Pseudo-code:
```ts
async function withRetry(op, attempts = 3) {
	let delay = 250;

	for (let i = 0; i < attempts; i++) {
		try { 
            return await op(); 
        } catch (e) {
			if (i === attempts - 1) throw e;

			await new Promise(resolve => setTimeout(resolve, delay));

			delay *= 2;
		}
	}
}
```

### Efficient Context Lifecycle
_Why: Prevents drift from outdated or duplicative events._
- Cull stale entries (e.g., actions > 30m old) to keep prompt concise.
- Avoid duplicate semantic events; coalesce rapid similar actions.

```ts
function pruneContext() {
	const now = Date.now();
	agent.context = agent.context.filter(entry => now - (entry.timestamp || now) < 30 * 60_000);
}
```

### Server vs Browser Separation
_Why: Protects the secret key and centralizes security, rate limiting, and auditing._
- Prefer running SDK server-side with secret key; expose minimal HTTP endpoints for browser.
- If using browser, proxy: browser -> your server -> Heylock.

### Using `rewrite` Safely
_Why: Ensures consistent tone while preserving original data for audits and rollback._
- Use for style normalization (tone, grammar) before storage or indexing.
- Keep original text if audit trail required.

```ts
const polished = await agent.rewrite(draft, 'Professional, concise, keep emojis if present');
```

### Sorting for Personalization
_Why: Clear objectives yield more reliable AI ranking and simplify post-result validation._
- Provide explicit objective: "Sort by relevance to SEARCH_TERM for a first-time visitor".

```ts
const ranking = await agent.sort(items, 'Sort by highest estimated CTR for mobile users');
```

### LocalStorage Hygiene (when `useStorage` true)
_Why: Namespacing avoids key collisions across environments and eases user privacy controls._
- Namespace via `agentId` per environment (e.g., `myagent-dev`, `myagent-prod`).
- Provide a manual clear option in user settings.

### Defensive UI States
_Why: Immediate feedback and constraint-based disabling reduce accidental duplicate actions._
- Disable send button while awaiting first chunk to avoid rapid duplicates.
- Grey out chat input on `usageRemaining.messages === 0`.

### Graceful Degradation
_Why: Users retain core functionality even when advanced AI features are unavailable._
- If AI features fail, provide sensible defaults: original order list, unmodified text, chat disabled banner.
- Communicate fallback politely to user only when necessary.

### Internationalization
_Why: Stable machine-readable context improves model consistency across locales._
- Store stable event keys in context ("Added to cart") and localize only in UI layer; keep context language consistent for model reliability.

### Cleaning / Resetting Sessions
_Why: Resetting clears model bias from earlier context and supports multi-user demos/tests._
- Expose a "Reset Conversation" button that calls `clearMessageHistory()` and optionally `clearContext()`.

### Multi-Agent Architecture
_Why: Isolation between personas prevents context bleed and clarifies analytics attribution._
- Use distinct `agentId`s per persona (e.g., `support`, `recommender`).

## Troubleshooting / FAQ

| Issue | Likely Cause | Action |
|-------|--------------|--------|
| `isInitialized` stays false | Invalid key / network error | Regenerate agent key; Check console warnings. |
| Throttling warning on `shouldEngage` | Called again < 15s | Debounce / gate UI triggers. |
| Streaming stops early | Network interruption | Retry with exponential backoff; inspect partial assistant message. |
| `fallback: true` in sort/rewrite | Service fallback or rate limit | Present basic result; optionally retry later. |
| Context not persisting | `useStorage` false or server env | Enable `useStorage` in browser; confirm not running server-side. |

For questions or assistance, contact [support@heylock.dev](mailto:support@heylock.dev).

## Security Notes

- The agent secret key is sensitive—treat like any private API key.
- Recommended: Keep key on the server; expose a minimal proxy endpoint for untrusted clients.
- Avoid embedding the secret in public bundles. If you do client proofs-of-concept, rotate keys frequently.
- Disable `useStorage` if you don't want context written to the user's browser.

## License

Apache 2.0. See [LICENSE](./LICENSE).

## Support

- Issues: GitHub Issues
- Email: support@heylock.dev