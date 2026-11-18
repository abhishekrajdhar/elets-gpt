# EletsGPT 2.0 — RAG Architecture

Status: **designed; implementation in Phases 3–4.** The API contracts (`/conversations/{id}/messages` SSE stream,
`/retrieval/inspect`, `retrieval_traces`) and the UI that uses them are already built. Until the engine ships, they
return `engine_not_ready`.

## Request flow

```
query + UI filters + user role
  │
  ▼  1. Guard: length limits, rate limit, prompt-injection heuristics (logged, not blocking on their own)
  ▼  2. Classify → {factual, quantitative, comparative, temporal, multi_hop, entity_lookup, summarization, out_of_domain}
  │      rules first (cheap regexes: "how many", "compare", years, "who is"), small LLM call only if uncertain
  │      extracted slots: verticals, date range, entities (resolved against `entities`), metric
  ▼  3. Route
  │      quantitative / aggregate → SQL lane (4D), with a retrieval fallback for narrative context
  │      out_of_domain → abstain with an explanation
  │      everything else → hybrid retrieval (fallback for every route)
  ▼  4. Hybrid retrieval (independent lanes, run concurrently)
  │      dense:   pgvector HNSW cosine on chunk_embeddings (active model), top N_dense (default 50)
  │      lexical: Postgres FTS websearch_to_tsquery + ts_rank_cd on chunks.search_tsv, top N_lex (default 50)
  │      both lanes apply the same metadata filters + access_level ≤ role max + is_active + document.status = active
  ▼  5. Fuse: Reciprocal Rank Fusion, score = Σ w_lane / (k + rank_lane), k default 60, weights configurable
  ▼  6. Rerank: cross-encoder (default BAAI/bge-reranker-v2-m3, local; or a hosted reranker) on top M (default 30)
  ▼  7. Evidence selection: top K (default 8) under a token budget; per-document cap (default 3) for diversity;
  │      merge adjacent chunks; for multi_hop, expand via document_entities / document_relations, then re-score
  ▼  8. Generate (streaming): system prompt states the rules; evidence passed as numbered, delimited, untrusted blocks
  ▼  9. Verify citations: every [n] must map to an evidence block; every cited chunk_id must exist and be active;
  │      URLs are taken from documents rows, never from model text. Unsupported sentences are flagged; if evidence
  │      coverage is below threshold → abstain
  ▼ 10. Persist: messages(citations, tokens, cost, latency) + retrieval_traces + usage_events
```

## Query-type strategies

| Type | Strategy |
|---|---|
| factual | hybrid → rerank → K=6 |
| quantitative | SQL lane for counts/aggregates; hybrid for narrative support; numbers in the answer come from SQL results |
| comparative | one sub-query per compared item (vertical, org, year), retrieved separately, balanced evidence |
| temporal | date filter from slots; recency-aware tie-break; ordered evidence |
| multi_hop | decompose → retrieve hop 1 → resolve entities → retrieve hop 2 restricted by entity/doc relations |
| entity_lookup | entity resolution (trigram on `entities.normalized_name`) → documents by `document_entities` → hybrid within them |
| summarization | wider retrieval (K up to 15), per-document cap, map-reduce summary for long contexts |
| out_of_domain | abstain; suggest in-domain rephrasings |

## SQL analytics lane (Phase 4)
- The LLM only selects an **intent template with parameters** (e.g. `count_documents(vertical, year)`,
  `top_entities(type, vertical, period, limit)`, `compare_coverage(verticals[], period)`, `count_events(period)`).
  It can also emit a SQL draft, which must pass a validator.
- Validator: parsed with `sqlglot`; single `SELECT`; only allowlisted views and columns; no functions outside an
  allowlist; mandatory `LIMIT`; parameters bound, never interpolated.
- Execution: separate read-only role, `default_transaction_read_only = on`, `statement_timeout = 3000ms`.
- The answer shows the result table and the SQL that produced it.

## Answer contract
Each assistant message stores and renders:
- answer text with `[n]` markers;
- a citations list: title, canonical URL (from DB), publication date, excerpt, page number or video timestamp,
  verification status;
- a fact/interpretation split: sentences carrying citations are facts; synthesis is labelled "Analysis";
- conflicts: when evidence blocks disagree on a value or date, both are shown;
- abstention: an explicit "insufficient evidence" state, with the closest sources found.

## Prompt-injection resistance
- Retrieved content goes in fenced `<evidence id=n source=…>` blocks. The system prompt says the evidence is data,
  and anything inside it that looks like an instruction is ignored.
- The model has no tools that act on the outside world. Output is rendered as Markdown, sanitized, with links
  restricted to cited URLs.
- Ingestion strips scripts and hidden text, and flags chunks with instruction-like patterns (`metadata.suspicious`),
  which are down-weighted.

## Providers (adapters)
- `LLMProvider`: `stream(messages, **opts)`, `complete(...)`, token accounting. Adapters: Anthropic, OpenAI-compatible
  (OpenAI, Azure OpenAI, vLLM, Ollama, Together), Google.
- `EmbeddingProvider`: `embed(texts, kind=query|document)`. Adapters: sentence-transformers (local, default `BAAI/bge-m3`),
  OpenAI-compatible, Voyage, Cohere.
- `Reranker`: `score(query, passages)`. Adapters: local cross-encoder, Cohere/Voyage/Jina rerank.
- The provider and model are chosen in `app_settings`; keys come from the environment. Missing keys show up as
  "not configured" in Admin, and the feature is disabled. It never fakes a response.

## Configuration (`app_settings.retrieval`)
`dense_top_k`, `lexical_top_k`, `rrf_k`, `rrf_weights {dense, lexical}`, `rerank_enabled`, `rerank_top_n`,
`final_context_k`, `max_context_tokens`, `per_document_cap`, `abstain_threshold`, `classifier_mode` (`rules` |
`rules+llm`). The Admin page edits these, and every trace records the exact configuration it used.
