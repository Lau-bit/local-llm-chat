# Context sources — design and measured behaviour

The app has four **context sources**: Web search, Concept map, Local library, Browser history.
They are not tools. Nothing is invoked by the model — each source is built by the app *before* the
request is sent and injected as a `system` message. This document records how they are assembled and
what was measured on real hardware, so the design decisions are not re-derived from scratch.

Terminology is deliberately shared across three surfaces — `CONTEXT_SOURCES` in `renderer.js` is the
single source of truth for the composer tooltip, the in-chat note, and the `## Context source: <name>`
header the model reads.

## Request shape

```
[system: preamble]            ← always sent, constant text
[system: primed concept map]  ← once per chat, frozen
…conversation…
[system: per-message sources] ← library / history / web / map slice, before the newest user turn
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
