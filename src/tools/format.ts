import type { RankedModel } from "../types.js";

/** Format a single model as a Markdown block */
export function modelToMarkdown(m: RankedModel, index?: number): string {
  const prefix = index != null ? `### ${index}. ` : "### ";
  const lines: string[] = [
    `${prefix}${m.name}`,
    `**Creator:** ${m.creator}  |  **Source:** ${m.source}`,
  ];

  if (m.elo_score != null) lines.push(`**Elo:** ${m.elo_score}`);
  if (m.benchmark_score != null) lines.push(`**Benchmark:** ${m.benchmark_score}`);

  if (m.pricing) {
    const parts: string[] = [];
    if (m.pricing.input_cost != null) parts.push(`Input $${m.pricing.input_cost.toFixed(2)}`);
    if (m.pricing.output_cost != null) parts.push(`Output $${m.pricing.output_cost.toFixed(2)}`);
    if (parts.length) lines.push(`**Pricing** (${m.pricing.unit}): ${parts.join(" / ")}`);
  }

  if (m.performance) {
    const parts: string[] = [];
    if (m.performance.throughput != null) parts.push(`${m.performance.throughput.toFixed(1)} tok/s`);
    if (m.performance.latency != null) parts.push(`${m.performance.latency.toFixed(0)}ms latency`);
    if (parts.length) lines.push(`**Performance:** ${parts.join(" / ")}`);
  }

  if (m.tags.length > 0) {
    lines.push(`**Tags:** ${m.tags.slice(0, 6).join(", ")}`);
  }

  return lines.join("\n");
}

/** Format a list of models as Markdown */
export function leaderboardToMarkdown(
  models: RankedModel[],
  title: string,
): string {
  if (models.length === 0) return `## ${title}\n\nNo models found.`;
  const header = `## ${title}\n\n*${models.length} model(s) — data from ${models[0].source}*\n`;
  const body = models.map((m, i) => modelToMarkdown(m, i + 1)).join("\n\n");
  return `${header}\n${body}`;
}

/** Format a comparison table in Markdown */
export function comparisonToMarkdown(models: RankedModel[]): string {
  if (models.length === 0) return "No models found for comparison.";

  const header = `## Model comparison\n`;
  const cols = ["Model", "Creator", "Elo", "Benchmark", "Input cost", "Throughput", "Source"];
  const sep = cols.map(() => "---");
  const rows = models.map((m) => [
    m.name,
    m.creator,
    m.elo_score != null ? String(m.elo_score) : "—",
    m.benchmark_score != null ? String(m.benchmark_score) : "—",
    m.pricing?.input_cost != null ? `$${m.pricing.input_cost.toFixed(2)}` : "—",
    m.performance?.throughput != null ? `${m.performance.throughput.toFixed(1)} tok/s` : "—",
    m.source,
  ]);

  const table = [
    `| ${cols.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");

  return `${header}\n${table}`;
}
