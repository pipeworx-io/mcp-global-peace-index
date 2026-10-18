interface McpToolDefinition {
  name: string;
  description: string;
  /** Human-facing one-liner (fleet #1967). Optional; consumers fall back to
   *  description. Kept in step with shared/src/types.ts — scripts/lib/
   *  check-inlined-types.mjs reports drift at publish time. */
  summary?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Global Peace Index — annual country peacefulness score and rank, for
 * country-risk context alongside event/news data (fleet #3276).
 *
 * Publisher + dataset: Institute for Economics & Peace, Global Peace Index.
 * Published annually as a report (no live query API), so this pack reads
 * from a baked copy rather than proxying per request — see
 * workers/gateway/src/pack-baked-indexes.json and scripts/bake-global-peace-index.mjs
 * for the refresh path. NEVER value-import the data module here (fleet
 * #2754 — it goes into every gateway isolate's bundle whether or not that
 * isolate ever serves this pack); only type-only imports are allowed.
 *
 * LICENCE: the Institute for Economics & Peace's official GPI data download
 * carries a stated non-commercial licence, and its Terms & Conditions
 * require written permission to republish. Bruce ruled 2026-10-17
 * (build-anyway-zero-rate) to ship it anyway with the whole pack zero-rated
 * — see pack-manifest.json's `zeroRated`/`zeroRatedReason` for this pack.
 * Every response carries the publisher's attribution in its `source` field.
 */
import type { GpiCountryRow } from './gpi-index-data.js';

const SOURCE = 'Institute for Economics & Peace, Global Peace Index';

// fleet #2754: the baked index lives in KV, injected as args._bakedIndex on
// the first call into this pack, never imported at module scope.
let GPI_COUNTRIES: GpiCountryRow[] = [];
let GPI_EDITION_YEAR = 0;
let GPI_CAPTURED_AT = '';

function ensureIndex(args: Record<string, unknown>): void {
  if (GPI_COUNTRIES.length) return;
  const idx = args._bakedIndex as Record<string, unknown> | null | undefined;
  const countries = idx?.GPI_COUNTRIES;
  const year = idx?.GPI_EDITION_YEAR;
  const capturedAt = idx?.GPI_CAPTURED_AT;
  if (!Array.isArray(countries) || countries.length === 0 || typeof year !== 'number' || typeof capturedAt !== 'string') {
    throw new Error(
      'global-peace-index: the baked index is unavailable (not injected or malformed). ' +
      'The gateway loads it from KV on the first call into this pack; this is a server-side fault, not a bad country name — retry shortly.',
    );
  }
  GPI_COUNTRIES = countries as GpiCountryRow[];
  GPI_EDITION_YEAR = year;
  GPI_CAPTURED_AT = capturedAt;
}

// A handful of names callers reach for that do not match the publisher's own
// spelling (verified against the baked rows: "United States of America",
// "Democratic Republic of the Congo", "Republic of the Congo", ...).
const ALIASES: Record<string, string> = {
  usa: 'united states of america',
  us: 'united states of america',
  'united states': 'united states of america',
  america: 'united states of america',
  uk: 'united kingdom',
  britain: 'united kingdom',
  drc: 'democratic republic of the congo',
  'dr congo': 'democratic republic of the congo',
  'democratic republic of congo': 'democratic republic of the congo',
  'congo-kinshasa': 'democratic republic of the congo',
  'congo-brazzaville': 'republic of the congo',
  'ivory coast': "cote d'ivoire",
  'north korea': 'north korea',
  'south korea': 'south korea',
};

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function findCountry(query: string): { row: GpiCountryRow | null; candidates: string[] } {
  const q = normalize(query);
  const aliased = ALIASES[q] ?? q;
  const byExact = GPI_COUNTRIES.find((r) => normalize(r.country) === aliased);
  if (byExact) return { row: byExact, candidates: [] };
  const contains = GPI_COUNTRIES.filter((r) => normalize(r.country).includes(aliased) || aliased.includes(normalize(r.country)));
  if (contains.length === 1) return { row: contains[0]!, candidates: [] };
  return { row: null, candidates: contains.map((r) => r.country) };
}

const tools: McpToolExport['tools'] = [
  {
    name: 'gpi_country_score',
    description:
      'Global Peace Index score and rank for ONE country — a country peacefulness measure (societal safety, ongoing conflict, and militarisation indicators rolled into one score; LOWER = more peaceful). Published annually by the Institute for Economics & Peace. PREFER for "how peaceful is <country>", "<country> global peace index", "peace ranking for <country>", or as background context on a country before/alongside news-event data (complements gdelt). Pass a country name (e.g. "Iceland", "Russia", "United States" — common aliases like "USA"/"DRC" are accepted).',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: 'Country name (e.g. "Ukraine", "Japan", "USA").' },
      },
      required: ['country'],
    },
  },
  {
    name: 'gpi_ranking',
    description:
      'Rank countries by Global Peace Index score — the N most peaceful or N least peaceful countries in one call, with rank and score. PREFER for "most peaceful countries", "least peaceful/most dangerous countries", "top 10 most peaceful nations", "which countries have the worst peace ranking". direction defaults to "most_peaceful".',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many countries to return (default 10, max 50).' },
        direction: { type: 'string', enum: ['most_peaceful', 'least_peaceful'], description: 'Which end of the ranking to return. Default "most_peaceful".' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  ensureIndex(args);
  switch (name) {
    case 'gpi_country_score':
      return gpiCountryScore(String(args.country ?? args.country_name ?? '').trim());
    case 'gpi_ranking':
      return gpiRanking(
        typeof args.limit === 'number' ? args.limit : Number(args.limit) || 10,
        args.direction === 'least_peaceful' ? 'least_peaceful' : 'most_peaceful',
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function gpiCountryScore(country: string) {
  if (!country) {
    throw new Error('Pass a country name, e.g. gpi_country_score({country: "Iceland"}).');
  }
  const { row, candidates } = findCountry(country);
  if (!row) {
    throw new Error(
      candidates.length > 1
        ? `user_error: "${country}" matches more than one country in the Global Peace Index: ${candidates.join(', ')}. Pass one of those exact names.`
        : `user_error: No Global Peace Index entry found for "${country}". The Index covers ${GPI_COUNTRIES.length} countries/territories; check the spelling.`,
    );
  }
  return {
    country: row.country,
    year: GPI_EDITION_YEAR,
    rank: row.rank,
    total_countries: GPI_COUNTRIES.length,
    score: row.score,
    scale: 'lower = more peaceful (observed range ~1.1-3.4)',
    rank_change_vs_prior_edition: row.rank_change,
    source: SOURCE,
    data_as_of: GPI_CAPTURED_AT,
  };
}

function gpiRanking(limitRaw: number, direction: 'most_peaceful' | 'least_peaceful') {
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10));
  const sorted = [...GPI_COUNTRIES].sort((a, b) => (direction === 'most_peaceful' ? a.rank - b.rank : b.rank - a.rank));
  const slice = sorted.slice(0, limit);
  return {
    direction,
    returned: slice.length,
    total_countries: GPI_COUNTRIES.length,
    year: GPI_EDITION_YEAR,
    scale: 'lower = more peaceful (observed range ~1.1-3.4)',
    source: SOURCE,
    data_as_of: GPI_CAPTURED_AT,
    ranking: slice.map((r) => ({ rank: r.rank, country: r.country, score: r.score, rank_change_vs_prior_edition: r.rank_change })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
