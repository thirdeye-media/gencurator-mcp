import type { RankedModel, Modality, BenchLMCategory } from "../types.js";
import type {
  GetLeaderboardParams,
  SearchModelsParams,
  RecommendParams,
  CompareModelsParams,
} from "../schemas/index.js";
import { fetchAALeaderboard } from "../services/artificial-analysis.js";
import { fetchHFModels } from "../services/huggingface.js";
import { fetchORModels } from "../services/openrouter.js";
import { fetchBenchLMLeaderboard } from "../services/benchlm.js";
import { leaderboardToMarkdown, comparisonToMarkdown, modelToMarkdown } from "./format.js";

interface SourceResult {
  models: RankedModel[];
  warnings: string[];
}

async function safeCall<T>(
  source: string,
  fn: () => Promise<T[]>,
): Promise<{ value: T[]; warning: string | null }> {
  try {
    const value = await fn();
    return { value, warning: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { value: [], warning: `${source}: ${msg}` };
  }
}

async function getModelsFromSource(
  source: string,
  modality: Modality,
  limit: number,
  search?: string,
  category?: BenchLMCategory,
): Promise<SourceResult> {
  const warnings: string[] = [];

  switch (source) {
    case "artificial_analysis": {
      if (!process.env.ARTIFICIAL_ANALYSIS_API_KEY) {
        return { models: [], warnings: ["artificial_analysis: ARTIFICIAL_ANALYSIS_API_KEY not set — get a free key at https://artificialanalysis.ai/"] };
      }
      const r = await safeCall("artificial_analysis", () => fetchAALeaderboard(modality));
      if (r.warning) warnings.push(r.warning);
      return { models: r.value.slice(0, limit), warnings };
    }
    case "huggingface": {
      const r = await safeCall("huggingface", () => fetchHFModels(modality, { search, limit }));
      if (r.warning) warnings.push(r.warning);
      return { models: r.value, warnings };
    }
    case "openrouter": {
      if (modality !== "text") {
        return { models: [], warnings: [`openrouter: only supports text modality (requested ${modality})`] };
      }
      const r = await safeCall("openrouter", () => fetchORModels({ search, limit }));
      if (r.warning) warnings.push(r.warning);
      return { models: r.value, warnings };
    }
    case "benchlm": {
      if (modality !== "text") {
        return { models: [], warnings: [`benchlm: only supports text modality (requested ${modality})`] };
      }
      const r = await safeCall("benchlm", () => fetchBenchLMLeaderboard({ category, limit }));
      if (r.warning) warnings.push(r.warning);
      return { models: r.value, warnings };
    }
    case "all": {
      const tasks: Array<Promise<{ source: string; value: RankedModel[]; warning: string | null }>> = [];

      if (process.env.ARTIFICIAL_ANALYSIS_API_KEY) {
        tasks.push(
          safeCall("artificial_analysis", () => fetchAALeaderboard(modality))
            .then((r) => ({ source: "artificial_analysis", value: r.value.slice(0, limit), warning: r.warning }))
        );
      } else {
        warnings.push("artificial_analysis: skipped (ARTIFICIAL_ANALYSIS_API_KEY not set)");
      }

      tasks.push(
        safeCall("huggingface", () => fetchHFModels(modality, { search, limit: Math.min(limit, 10) }))
          .then((r) => ({ source: "huggingface", value: r.value, warning: r.warning }))
      );

      if (modality === "text") {
        tasks.push(
          safeCall("openrouter", () => fetchORModels({ search, limit: Math.min(limit, 10) }))
            .then((r) => ({ source: "openrouter", value: r.value, warning: r.warning }))
        );
        tasks.push(
          safeCall("benchlm", () => fetchBenchLMLeaderboard({ category, limit: Math.min(limit, 10) }))
            .then((r) => ({ source: "benchlm", value: r.value, warning: r.warning }))
        );
      }

      const settled = await Promise.allSettled(tasks);
      const merged: RankedModel[] = [];
      for (const r of settled) {
        if (r.status === "fulfilled") {
          if (r.value.warning) warnings.push(r.value.warning);
          merged.push(...r.value.value);
        } else {
          warnings.push(`unknown: ${r.reason}`);
        }
      }
      return { models: merged.slice(0, limit), warnings };
    }
    default:
      throw new Error(`Unknown source: ${source}. Use one of: artificial_analysis, huggingface, openrouter, benchlm, all`);
  }
}

function appendWarnings(text: string, warnings: string[]): string {
  if (warnings.length === 0) return text;
  return `${text}\n\n---\n*Warnings:*\n${warnings.map((w) => `- ${w}`).join("\n")}`;
}

function formatResponse(
  result: SourceResult,
  title: string,
  format: string,
): { content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown> } {
  const { models, warnings } = result;
  if (format === "json") {
    const output = { title, count: models.length, models, warnings };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }
  const md = leaderboardToMarkdown(models, title);
  return { content: [{ type: "text", text: appendWarnings(md, warnings) }] };
}

// ── tool handlers ───────────────────────────────────────────────

export async function handleGetLeaderboard(
  params: GetLeaderboardParams,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown> }> {
  const result = await getModelsFromSource(
    params.source,
    params.modality,
    params.limit,
    undefined,
    params.category,
  );
  const title = `Top ${params.modality} models (${params.source})${params.category ? ` — ${params.category}` : ""}`;
  return formatResponse(result, title, params.response_format);
}

export async function handleSearchModels(
  params: SearchModelsParams,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown> }> {
  const modalities: Modality[] = params.modality
    ? [params.modality]
    : ["text", "image", "video", "audio", "music"];

  const results: RankedModel[] = [];
  const warnings: string[] = [];

  for (const mod of modalities) {
    const tasks = [
      safeCall("huggingface", () => fetchHFModels(mod, { search: params.query, limit: params.limit })),
      mod === "text"
        ? safeCall("openrouter", () => fetchORModels({ search: params.query, limit: params.limit }))
        : Promise.resolve({ value: [] as RankedModel[], warning: null }),
      mod === "text"
        ? safeCall("benchlm", () => fetchBenchLMLeaderboard({ limit: 50 }).then((all) => {
            const q = params.query.toLowerCase();
            return all.filter(
              (m) => m.name.toLowerCase().includes(q) || m.creator.toLowerCase().includes(q),
            );
          }))
        : Promise.resolve({ value: [] as RankedModel[], warning: null }),
    ];

    if (process.env.ARTIFICIAL_ANALYSIS_API_KEY) {
      tasks.push(
        safeCall("artificial_analysis", () => fetchAALeaderboard(mod).then((all) => {
          const q = params.query.toLowerCase();
          return all.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              m.creator.toLowerCase().includes(q) ||
              m.tags.some((t) => t.toLowerCase().includes(q))
          );
        }))
      );
    }

    const settled = await Promise.all(tasks);
    for (const r of settled) {
      if (r.warning) warnings.push(`[${mod}] ${r.warning}`);
      results.push(...r.value);
    }
  }

  // Deduplicate by name (prefer entries with Elo scores)
  const seen = new Map<string, RankedModel>();
  for (const m of results) {
    const key = m.name.toLowerCase();
    const existing = seen.get(key);
    if (!existing || (m.elo_score != null && existing.elo_score == null)) {
      seen.set(key, m);
    }
  }

  const deduped = Array.from(seen.values()).slice(0, params.limit);
  const title = `Search results for "${params.query}"`;
  return formatResponse({ models: deduped, warnings }, title, params.response_format);
}

export async function handleRecommend(
  params: RecommendParams,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown> }> {
  const result = await getModelsFromSource("all", params.modality, 50);
  const allModels = result.models;

  if (allModels.length === 0) {
    return {
      content: [{
        type: "text",
        text: appendWarnings(
          `No ${params.modality} models found.`,
          result.warnings.length > 0 ? result.warnings : ["No sources returned data — check that API keys are configured."],
        ),
      }],
    };
  }

  const scored = allModels.map((m) => {
    let score = 0;

    if (m.elo_score != null) score += m.elo_score / 10;
    if (m.benchmark_score != null) score += m.benchmark_score * 10;

    switch (params.priority) {
      case "quality":
        break;
      case "speed":
        if (m.performance?.throughput) score += m.performance.throughput * 2;
        if (m.performance?.latency) score -= m.performance.latency / 100;
        break;
      case "cost":
        if (m.pricing?.input_cost != null) score -= m.pricing.input_cost * 5;
        if (m.pricing?.output_cost != null) score -= m.pricing.output_cost * 3;
        break;
      case "balanced":
        if (m.performance?.throughput) score += m.performance.throughput;
        if (m.pricing?.input_cost != null) score -= m.pricing.input_cost;
        break;
    }

    return { model: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, params.limit).map((s) => s.model);

  if (params.response_format === "json") {
    const output = {
      use_case: params.use_case,
      modality: params.modality,
      priority: params.priority,
      recommendations: top,
      warnings: result.warnings,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }

  const header = [
    `## Recommendations for: "${params.use_case}"`,
    `**Modality:** ${params.modality}  |  **Priority:** ${params.priority}`,
    "",
  ].join("\n");
  const body = top.map((m, i) => modelToMarkdown(m, i + 1)).join("\n\n");

  return { content: [{ type: "text", text: appendWarnings(`${header}\n${body}`, result.warnings) }] };
}

export async function handleCompareModels(
  params: CompareModelsParams,
): Promise<{ content: Array<{ type: "text"; text: string }>; structuredContent?: Record<string, unknown> }> {
  const result = await getModelsFromSource("all", params.modality, 200);
  const allModels = result.models;

  const matched: RankedModel[] = [];
  const notFound: string[] = [];

  for (const name of params.model_names) {
    const q = name.toLowerCase();
    const found = allModels.find(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.creator.toLowerCase() === q
    );
    if (found) {
      matched.push(found);
    } else {
      notFound.push(name);
    }
  }

  if (params.response_format === "json") {
    const output = {
      compared: matched,
      not_found: notFound,
      warnings: result.warnings,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      structuredContent: output,
    };
  }

  let text = comparisonToMarkdown(matched);
  if (notFound.length > 0) {
    text += `\n\n*Could not find: ${notFound.join(", ")}*`;
  }

  return { content: [{ type: "text", text: appendWarnings(text, result.warnings) }] };
}
