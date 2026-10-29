# @pipeworx/global-peace-index

Annual country peacefulness score and rank — country-risk context to pair
with event/news data, so a spike of conflict or violence news for a country
can be read against its standing peacefulness level.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

- `gpi_country_score(country)` — the Index score, rank, and rank change vs
  the prior edition for one country.
- `gpi_ranking(limit, direction)` — the N most peaceful or N least peaceful
  countries, ranked, in one call.

## Auth

Keyless.

## Data sources

- Institute for Economics & Peace, Global Peace Index — an annual composite
  score built from societal safety and security, ongoing domestic and
  international conflict, and militarisation indicators, covering 163
  countries and territories. Lower score = more peaceful.

## Licence

The Institute for Economics & Peace's official Global Peace Index data
download carries a stated non-commercial licence, and its Terms & Conditions
require written permission before republishing. Bruce ruled 2026-10-17 to
ship this pack anyway — zero-rated (0 credits on every tier, never counted
toward volume pricing) and carrying the publisher's attribution in every
response's `source` field — the same shape as the symmap (#1385) and
openvc-share-too case rulings. See CLAUDE.md's licence section for the
ruling text.

## Data freshness

Published only as an annual report (no live query API), so this pack reads
from a periodically-refreshed copy rather than a per-request live call. Every
response carries `data_as_of` (when this pack's copy was last refreshed) and
`year` (the edition's own data year) — check both before citing a figure as
current.

## Common pitfalls

- Country names are the publisher's own spelling (e.g. "United States of
  America", "Democratic Republic of the Congo", "Republic of the Congo") — a
  handful of common aliases (USA, UK, DRC...) are accepted.
- Lower score = more peaceful; lower rank number = MORE peaceful (rank 1 is
  the most peaceful country).
- `rank_change_vs_prior_edition` is PLACES MOVED in the ranking, not a score
  delta — positive means the rank improved (moved toward 1).

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "global-peace-index": {
      "url": "https://gateway.pipeworx.io/global-peace-index/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/global-peace-index/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/gpi_country_score \
  -H 'Content-Type: application/json' \
  -d '{"country":"Iceland"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/gpi_country_score`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-global-peace-index` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/global-peace-index/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "global-peace-index": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-global-peace-index"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Global Peace Index data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
