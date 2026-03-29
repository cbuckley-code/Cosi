# Playbook

The Playbook tool is a semantic memory store for tool usage patterns, optimizations, and lessons learned across all Cosi tools.

## What it does

- **Stores** natural language entries describing how to best use tools, common pitfalls, rate limiting strategies, pagination patterns, and other operational knowledge
- **Retrieves** relevant entries using semantic similarity via Amazon Titan Text embeddings (`amazon.titan-embed-text-v2:0`)
- **Persists** all entries in Redis so knowledge accumulates across sessions

## How it works

Each entry has:
- `toolName` — which tool the knowledge applies to (use `"general"` for cross-tool patterns)
- `title` — short descriptive title
- `content` — full description of the pattern or lesson
- `tags` — optional tags like `["pagination", "rate-limiting", "auth"]`

Entries are embedded with Titan Text and stored in Redis. Searches compute cosine similarity in-memory to find the most relevant entries for a given query.

## When to use it

- **Before executing a tool** — search for relevant playbook entries to inform the approach
- **After discovering a useful pattern** — add an entry so it's available for future use
- **When a tool call fails** — add an entry documenting the failure mode and fix

## Scope

Every generated Cosi tool automatically calls `search_playbook` at the start of each invocation and includes matching entries as context in its response.
