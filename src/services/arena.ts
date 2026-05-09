import type { RankedModel } from "../types.js";
import { fetchHtml } from "./api-client.js";
import { cacheGet, cacheSet } from "./cache.js";
import { API_URLS, CACHE_TTL_MS } from "../constants.js";

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function firstLinkText(html: string): string | null {
  const m = html.match(/<a[^>]*>([^<]+)<\/a>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function parseElo(raw: string): number | null {
  const m = raw.match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function parsePriceCell(raw: string): { input: number | null; output: number | null } {
  // "$5 / $25" → { input: 5, output: 25 }
  const m = raw.match(/\$?([\d.]+)\s*\/\s*\$?([\d.]+)/);
  if (!m) return { input: null, output: null };
  return { input: parseFloat(m[1]), output: parseFloat(m[2]) };
}

function extractTds(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(rowHtml)) !== null) cells.push(m[1]);
  return cells;
}

function parseModelCell(cellHtml: string): { name: string; creator: string } {
  const linkText = firstLinkText(cellHtml);
  const full = stripTags(cellHtml);

  if (linkText) {
    // full looks like "Anthropic claude-opus-4-7-thinking Anthropic · Proprietary"
    // Text between model name and "·" is the creator
    const afterModel = full.split(linkText)[1] ?? "";
    const creator = afterModel.split("·")[0].trim() || "Unknown";
    return { name: linkText, creator: creator || "Unknown" };
  }

  // Fallback: split on "·"
  const parts = full.split("·");
  const nameParts = (parts[0] ?? full).trim().split(/\s+/);
  return {
    name: nameParts[nameParts.length - 1] || full,
    creator: nameParts.slice(0, -1).join(" ") || "Unknown",
  };
}

function parseHtmlTable(html: string, limit: number): RankedModel[] {
  const now = new Date().toISOString();
  const models: RankedModel[] = [];

  const tbodyM = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const scope = tbodyM?.[1] ?? html;

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;

  while ((trM = trRe.exec(scope)) !== null) {
    const cells = extractTds(trM[1]);
    // Expected columns: rank, rankSpread, model, score, votes, price, context
    if (cells.length < 5) continue;

    const rankNum = parseInt(stripTags(cells[0]), 10);
    if (isNaN(rankNum)) continue;

    const { name, creator } = parseModelCell(cells[2]);
    if (!name || name === "Model") continue;

    const elo = parseElo(stripTags(cells[3]));
    const { input, output } = parsePriceCell(stripTags(cells[5] ?? ""));

    models.push({
      id: name,
      name,
      creator,
      modality: "text",
      elo_score: elo,
      benchmark_score: null,
      rank: rankNum,
      pricing:
        input != null || output != null
          ? { input_cost: input, output_cost: output, currency: "USD", unit: "per 1M tokens" }
          : null,
      performance: null,
      tags: [],
      source: "arena",
      last_updated: now,
    });

    if (models.length >= limit) break;
  }

  return models;
}

// For Next.js SSR apps, data is embedded in __NEXT_DATA__ as JSON.
function extractFromNextData(html: string, limit: number): RankedModel[] | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;

  try {
    const nextData = JSON.parse(m[1]) as Record<string, unknown>;
    const props = (nextData?.props as Record<string, unknown>)
      ?.pageProps as Record<string, unknown>;
    if (!props) return null;

    const raw = (props.leaderboard ??
      props.models ??
      props.data ??
      props.rankings) as unknown[] | undefined;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const now = new Date().toISOString();
    return raw.slice(0, limit).map((item: unknown, i: number) => {
      const entry = item as Record<string, unknown>;
      const name = String(entry.model_name ?? entry.name ?? entry.model ?? "unknown");
      const creator = String(
        entry.organization ?? entry.creator ?? entry.lab ?? entry.org ?? "Unknown",
      );
      const elo =
        typeof entry.score === "number"
          ? entry.score
          : typeof entry.elo === "number"
            ? entry.elo
            : null;
      const inputCost =
        typeof entry.input_price === "number" ? entry.input_price : null;
      const outputCost =
        typeof entry.output_price === "number" ? entry.output_price : null;

      return {
        id: name,
        name,
        creator,
        modality: "text" as const,
        elo_score: elo,
        benchmark_score: null,
        rank: typeof entry.rank === "number" ? entry.rank : i + 1,
        pricing:
          inputCost != null || outputCost != null
            ? { input_cost: inputCost, output_cost: outputCost, currency: "USD", unit: "per 1M tokens" }
            : null,
        performance: null,
        tags: [],
        source: "arena" as const,
        last_updated: now,
      };
    });
  } catch {
    return null;
  }
}

export async function fetchArenaLeaderboard(limit = 50): Promise<RankedModel[]> {
  const cacheKey = `arena:text:${limit}`;
  const cached = cacheGet<RankedModel[]>(cacheKey);
  if (cached) return cached;

  const html = await fetchHtml(API_URLS.ARENA);

  // Prefer structured Next.js SSR data when available
  const fromNext = extractFromNextData(html, limit);
  if (fromNext && fromNext.length > 0) {
    cacheSet(cacheKey, fromNext, CACHE_TTL_MS);
    return fromNext;
  }

  // Fall back to HTML table parsing
  const models = parseHtmlTable(html, limit);
  if (models.length === 0) {
    throw new Error(
      "arena.ai leaderboard returned no parseable data — the page may require JavaScript rendering. " +
        "Check https://arena.ai/leaderboard/text directly.",
    );
  }

  cacheSet(cacheKey, models, CACHE_TTL_MS);
  return models;
}
