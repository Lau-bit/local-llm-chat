# Context sources — design and measured behaviour

The app has five **context sources**: Web search, Concept map, Local library, Browser history,
Hermes warm memory.
Each is built by the app *before* the request is sent and injected as a `system` message — the model
invokes nothing and is told so explicitly. This document records how they are assembled and what was
measured on real hardware, so the design decisions are not re-derived from scratch.

The one exception is the concept map's **on-demand mode**, where the map is not injected at all and
the model is handed a single `concept_search` function to pull entries with. That mode is the only
place in the app where the model calls anything, and the preamble is swapped for a variant that says
so. Everything else on this page describes the injected path.

Terminology is deliberately shared across three surfaces — `CONTEXT_SOURCES` in `renderer.js` is the
single source of truth for the composer tooltip, the in-chat note, and the `## Context source: <name>`
header the model reads.

## Request shape

```
[system: preamble]            ← always sent, constant text
[system: primed concept map]  ← once per chat, frozen
…conversation…
[system: per-message sources] ← library / hermes / history / web / map slice, before the user turn
[user]
```

Two positions, for two different jobs:

- **Front matter** is byte-identical on every request, so the whole block stays a reusable prompt
  prefix. It also keeps the map far from the question, where it informs depth without supplying
  vocabulary.
- **Per-message sources** sit next to the user turn because they are *about* that turn.

### Concept map: prime once, then slice

In `overview` mode the map is rendered in full on the first send of a chat and then **frozen** for the
life of that chat (`primedConceptMap`). Later turns get only a small relevant slice
(≤40 concepts / 4,000 chars). Freezing is required: a prompt prefix is only reusable while it is
byte-identical, and the model should not be primed with one map and then handed a different one.

Re-primes on: new chat, opened chat, or any change to a render-affecting setting (tracked by
`cmPrimeSignature()` rather than cleared from each settings listener, so a setting added later cannot
leave a stale prime behind).

`relevant` mode skips priming entirely and injects a fresh selection each message.

#### Priming mid-chat

Priming is not tied to the first message of a chat — it happens on the first *send* that needs it,
whenever that falls. Verified against the running app by intercepting the outgoing request:

| mid-chat action | result |
|---|---|
| map switched on at turn 3 | primes on turn 3; full map at index 1, "primed for this chat" note |
| level/render setting changed | re-primes, new content (64,968 → 91,685 chars) |
| `ondemand` → `overview` | primes on the next send |
| chat closed and reopened | re-primes on the next send |
| later turn whose words match | prime *and* a per-message slice both ride along |

Turning the map **off** mid-chat does not remove an existing prime, and re-enabling does not
re-prime — once the model has seen the map, dropping it would invalidate the cached prefix for
nothing. Switching a primed chat to `ondemand` keeps the prime and, because the whole map is then
already in the prompt, **withholds `concept_search`** (`cmToolsForRequest` returns null when
`primedConceptMap` is set). Without that guard the request carried 91,685 chars of map alongside a
tool for looking it up, and a preamble announcing a search over content already in front of the model.

### Concept map: on demand (`ondemand`)

The third mode injects nothing and attaches one function instead:

```
concept_search(query: string, limit?: integer) → { concepts: [...], matched, note }
```

The model calls it when it judges the question needs the user's own context, and a JS loop in
`streamAssistantResponse` executes the call, appends the assistant message plus a `role: "tool"`
result, and re-sends. Each round streams into its own message bubble so the search note in the
transcript lands between them rather than above text that arrived after it.

Why the mode exists: injection puts the map in front of the model whether or not it is wanted, and
that is where personal vocabulary leaks into unrelated answers. Eight concepts the model asked for
cannot do that the way a thousand ambient lines of framework vocabulary can. What it costs: an extra
round trip whenever the model does search, retrieval moved into the model's judgement (a question it
misreads gets no map at all), and reasoning forced off.

Three constraints are designed in, each from a measured failure:

- **Reasoning is forced off whenever the tool is attached.** With thinking on, reasoning consumes the
  whole `max_tokens` budget and the reply arrives empty with `finish_reason: "length"` and *no tool
  call at all*. The failure is silent — the model simply never calls — so the app forces it off for
  the entire exchange and says so once per chat.
- **Broad queries are answered from salience, not lexical matching.** The model opens with
  `concept_search({"query": "*"})`; IDF matching returns nothing for that, and the model reads an
  empty list as an empty map. `cmIsBroadQuery()` tests the query's *tokens* — a string test lets
  `"my topics"` through to lexically match the concepts that merely contain the word "topics", which
  is worse than returning nothing, because those then stand as the answer.
- **The tool is withdrawn at `CM_TOOL_MAX_ROUNDS` (3).** The server keeps returning `tool_calls` for
  as long as tools are offered, so the cap is what forces an answer.

Malformed arguments — a real possibility, since they are reassembled from stream fragments — come back
to the model as an error tool result rather than throwing, so it can correct the call or answer
without it.

#### Three results, and why "no match" is not one of the fallbacks

`concept_search` returns `matched: "lexical" | "salience" | "none" | "blocked"`.

A **specific query that matches nothing returns `none` and no concepts at all.** It deliberately does
*not* fall back to salience: handing back the user's most recurring concepts because they asked about
a subject they have never touched parks their personal vocabulary next to an unrelated question, which
is the laundering this whole mode exists to prevent — and worse here than in the injected modes,
because the model asked for it and treats it as an answer. The risk that an empty list reads as an
empty map is handled by the note saying outright that it is not one, and stating how many concepts
were searched.

Matching also requires **two matched tokens once a query has three or more**. One token in three is
usually coincidence, and coincidence is expensive: `"kubernetes ingress controller"` matched two
concepts about *game* controllers on the strength of "controller" alone, which the model would have
taken as the user's view of Kubernetes. Short queries keep the single-token rule, and a wordy natural
-language query still reaches its concept because it only needs two.

`blocked` is the structural guard, and it is there because prose was measured failing. Asked *"given
what I usually work on, how should I approach Kubernetes ingress controllers?"*, the model searched
the subject specifically, was told the map holds nothing on it, **said so correctly** — and then
searched `"*"`, took the general list, and framed Kubernetes through the user's personal concepts
anyway. Strengthening the warning in the note did not stop it: the material was present and the model
wanted something to connect to. So within one send (`cmNewToolState()`, scoped per send because a miss
on an earlier turn says nothing about this one), a broad query *after* a miss returns nothing and says
why. With the guard in place the same question is answered *"I cannot tailor an approach to your
existing workflows… here is a general framework"*, which is the correct answer. A specific retry after
a miss is unaffected.

## Hermes warm memory: retrieving another agent's notes without inheriting their certainty

The fifth source reads a **warm-memory workspace** — the topic notes, assessments and decision
records the Hermes agent keeps outside this app, at `<home>/Hermes-General` by default. It is the
only source whose material arrives with an evidentiary standing already attached to it, and
preserving that standing across the trip into the prompt is the entire design.

The workspace sorts documents into four tiers, and a tier is not filing — it says how a claim in
that document may be used:

| tier | standing |
|---|---|
| `active/` | current topic, still point-in-time |
| `parked/` | historical until revalidated, **even where the prose is present-tense** |
| `archive/` | historical, kept for provenance |
| `inbox/` | untriaged, explicitly not evidence |

Three properties follow from that, and each is enforced in a different layer so no single edit can
quietly undo them:

- **Explicitly selected, never ambient.** The source ships off (`hermesEnabled: '0'`), and
  `sendMessage` has no path that reads the workspace with the toggle off. Turning it on searches
  `active/` only; the other three tiers are opt-in checkboxes in Settings → Hermes.
- **Non-current tiers cannot arrive by accident.** Even opted in, a parked/archive/inbox document
  is included **only when it lexically matches the message**. There is no recency or salience
  fallback for them, they are never used to pad a thin result, and — unlike current topics — an
  unmatched one is dropped rather than listed with a caveat. When one does appear, its tier
  standing is the first thing in its header, and `superseded_by` overrides the tier wording.
- **Read-only, and bounded at the Rust boundary.** `hermes_collect` is the only door. It resolves
  the root, and only the four known tier names can ever become a path, so a tier string cannot walk
  out of the workspace; README files, dotfiles and `templates/` are excluded, since a tier's README
  describes the tier rather than asserting a topic. Nothing in the app writes there.

### What each document carries

Every retrieved document is injected with its metadata block before any of its text: tier standing,
path, `status`, freshness, the `sources:` list it was built from, and its section headings. Freshness
comes from the document's own `information_as_of` and `review_after`, **never from the file's mtime**
— the workspace rewrites documents long after the observations they record, so an mtime would date
the edit and present it as the observation. A document past `review_after` is labelled `REVIEW DUE`;
one with no stamp is labelled as unable to be aged rather than silently treated as recent.

Ages are floored, not rounded. Most stamps are date-only and parse to midnight, so rounding reports
a note written yesterday evening as two days old and a review date as falling a day early.

### The matched-token floor, measured again

A query of three or more tokens must match a document on **two** of them. This is the same rule
`concept_search` needs, and it was re-measured here rather than assumed: *"how do I re-tension a
bicycle chain"* retrieved a UI-shock assessment, because that document happens to contain the word
"chain". A whole document is a far larger surface than a concept label, so a single common word lands
in one almost every time, and the result is a dated assessment of an unrelated subject presented as
relevant. Queries below three tokens keep single-token matching — there is nothing else to go on.

### When nothing matches

The block is still sent, but with **titles and dates only** and an explicit instruction not to
connect the answer to them. That is a deliberate middle path between the two failures: injecting
content nobody asked for (the laundering the concept map's on-demand mode exists to prevent), and
saying nothing, which leaves the model free to assume the workspace covers a subject it does not.
The list is the workspace's own current-topic index, which is also the first step of its documented
retrieval discipline.

Verified by `hermes.mjs` in the test harness (36 assertions, no model needed): the fixture cases for
tier handling, superseding, review dates and budgets, plus a read of the real workspace that asserts
its files are byte-for-byte untouched afterwards. The Rust seam, the UI wiring and the actual
injected system message were checked in the running app over CDP.

## Measured on gemma-4-26b-a4b (RTX 5090, 100% GPU offload)

Model explicitly loaded with `lms load --gpu max -c 65536` (16.76 GiB resident). **Load configuration
dominates every number here** — the same suite run against a GPU-contended, partially-offloaded model
was ~10× slower across the board, so benchmark only against a model you have confirmed is fully
offloaded (`lms ps`, `nvidia-smi`).

| | |
|---|---|
| prefill, 21.8k-token primed prompt | **3.2 s** |
| warm turn, same prefix | **0.2 s** |
| decode | **134–173 tok/s** |

Prefix reuse is worth **16×**. A per-message slice costs only its own tokens — inserting an 860-token
slice mid-array took a turn from 0.9 s to 2.0 s and left the map prefix intact. Two primed chats
coexist in cache; switching between them does not re-pay the prime.

An 8-turn primed chat held **0.5–2.3 s per turn** with the prompt growing only ~2k tokens in total.
After priming, turn cost tracks output length, not prompt size.

Context length is not a performance factor: 65,536 and 262,144 benchmark identically.

## Why the preamble is unconditional and constant

`CONTEXT_SOURCES_PREAMBLE` ships on every request even when no source is active.

Testing found the model confabulates tool state **worst when nothing is attached** — asked to "test the
tools" with all sources off it produced an invented Active / Degraded / Unavailable status table for
tools it does not have. With the preamble present it answers correctly: *"I do not have access to any
tools in this conversation… I cannot search the web, browse URLs, run code, or query databases."*

The text is constant rather than varying with the source count, because it sits at index 0 — text that
changed as toggles moved would invalidate the cached prefix, and the primed map behind it, on every
change.

There are two variants, and which one ships is decided by whether a tool is actually attached to that
request — not by the concept map's mode, so a chat whose map resolves to nothing still gets the plain
text, which is then still exactly right. `CONTEXT_SOURCES_PREAMBLE_TOOL` replaces the blanket "you have
no tools" paragraph with one that names `concept_search` and then denies everything else in the same
breath. Narrowing the denial rather than dropping it is deliberate: the confabulation it prevents is
about *other* tools, and a model handed one real function will otherwise narrate a whole toolchain
around it. Both variants keep the same three-paragraph shape, and each is literally true of the request
it ships with — which is the only reason the preamble works at all. Switching between them costs a
prefix invalidation, but only when the user changes concept-map mode mid-chat, which already re-primes.

## LaTeX is handled at render time, not by prompting

Local models emit `$\rightarrow$` in prose regardless of instructions. Measured: with the concept map
**off** and a 30-token prompt the model emitted *more* LaTeX (24 tokens) than with the map on (14) — so
this is not context-induced register drift, and an instruction not to use LaTeX does not prevent it.

`demathText()` converts it before markdown parsing, and this is the mechanism to rely on. It also
repairs a silent corruption: CommonMark eats the backslash in `\(…\)` and `\[…\]`, so that form loses
its delimiters and reads as ordinary parentheses.

Guards worth preserving when editing `MATH_SPAN_RE`: prices (`$5 to $10`) must never be read as math,
code fences and inline code are skipped, and an unmatched trailing `$` is left alone so a half-streamed
span is not converted early.

## Concept map data caveats

Two properties of the generated graphs that affect how the map should be read:

- **Levels do not encode abstraction.** Canonization assigns `macro` by how often a concept recurs, not
  how general it is, which is why concrete items appear at macro level alongside genuine abstractions.
  The `[level]` tag is deliberately not rendered into the injected text for this reason.
- **Evidence weight is the meaningful quality signal.** `cmEvidenceWeight` is records + chunks, so
  weight 2 is a single mention. `conceptMapMinEvidence` (default 3) excludes those; they are where
  incidental nouns enter the map presented as part of the user's conceptual space.

`conceptMapMaxChars` is a ceiling for runaway graphs, **not** a routine size control — its trim is a
tail cut on a salience-ranked list, and salience correlates with level, so a tight budget silently
becomes a level filter. Use minimum evidence and the level checkboxes to control size.

## Known limitations

- `estimateTokens` is `chars / 4.4`, calibrated against real `prompt_tokens` for this model (±1.4%).
  Other models/tokenisers will differ.
- With reasoning enabled and `max_tokens` set, thinking is drawn from the same budget and can consume
  all of it, returning empty content. The app detects this case and explains it.
- Attribution between stacked sources is not guaranteed — the model may credit the wrong source for a
  fact when several are active.
- On-demand mode needs a model that supports tool calling. There is no capability probe: a model that
  ignores the `tools` field simply answers without ever searching, which looks like the map being off.
- On-demand mode and reasoning are mutually exclusive, and the mode wins.
- Upstream of all of this, the graphs themselves are the limiting factor. Levels encode recurrence
  rather than abstraction, and canonization flattens relations — so however the map is delivered, it
  can currently only supply frequency-ranked nouns, not the *directions* the map is meant to give.
  That lives in the Data Analysis pipeline, not here.
