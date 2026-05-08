import type { RankedModel } from "../types.js";

/** Format a single model as a compact Markdown block (used in recommend output) */
export function modelToMarkdown(m: RankedModel, index?: number): string {
  const prefix = index != null ? `${index}. ` : "";
  const score = m.elo_score != null
    ? `Elo ${m.elo_score}`
    : m.benchmark_score != null
      ? `Score ${m.benchmark_score}`
      : null;
  const price = m.pricing
    ? [
        m.pricing.input_cost != null ? `$${m.pricing.input_cost.toFixed(2)} in` : null,
        m.pricing.output_cost != null ? `$${m.pricing.output_cost.toFixed(2)} out` : null,
      ].filter(Boolean).join("/")
    : null;
  const perf = m.performance?.throughput != null ? `${m.performance.throughput.toFixed(0)} tok/s` : null;

  const meta = [m.creator, score, price, perf].filter(Boolean).join(" · ");
  return `**${prefix}${m.name}** — ${meta}`;
}

/** Format a list of models as a compact Markdown table */
export function leaderboardToMarkdown(
  models: RankedModel[],
  title: string,
): string {
  if (models.length === 0) return `## ${title}\n\nNo models found.`;

  // Detect which columns have data across the result set
  const hasElo = models.some((m) => m.elo_score != null);
  const hasScore = models.some((m) => m.benchmark_score != null);
  const hasPricing = models.some((m) => m.pricing != null);
  const hasSpeed = models.some((m) => m.performance?.throughput != null);
  const multiSource = new Set(models.map((m) => m.source)).size > 1;

  type Col = { header: string; cell: (m: RankedModel) => string };
  const cols: Col[] = [
    { header: "#", cell: (m) => String(m.rank) },
    { header: "Model", cell: (m) => m.name },
    { header: "Creator", cell: (m) => m.creator },
    ...(hasElo ? [{ header: "Elo", cell: (m: RankedModel) => m.elo_score != null ? String(m.elo_score) : "—" }] : []),
    ...(hasScore ? [{ header: "Score", cell: (m: RankedModel) => m.benchmark_score != null ? String(m.benchmark_score) : "—" }] : []),
    ...(hasPricing ? [
      { header: "In$/1M", cell: (m: RankedModel) => m.pricing?.input_cost != null ? `$${m.pricing.input_cost.toFixed(2)}` : "—" },
      { header: "Out$/1M", cell: (m: RankedModel) => m.pricing?.output_cost != null ? `$${m.pricing.output_cost.toFixed(2)}` : "—" },
    ] : []),
    ...(hasSpeed ? [{ header: "tok/s", cell: (m: RankedModel) => m.performance?.throughput != null ? String(m.performance.throughput.toFixed(0)) : "—" }] : []),
    ...(multiSource ? [{ header: "Source", cell: (m: RankedModel) => m.source }] : []),
  ];

  const header = `## ${title}\n`;
  const tableHeader = `| ${cols.map((c) => c.header).join(" | ")} |`;
  const tableSep = `| ${cols.map(() => "---").join(" | ")} |`;
  const tableRows = models.map((m) => `| ${cols.map((c) => c.cell(m)).join(" | ")} |`);

  return [header, tableHeader, tableSep, ...tableRows].join("\n");
}

/** Format a comparison table in Markdown */
export function comparisonToMarkdown(models: RankedModel[]): string {
  if (models.length === 0) return "No models found for comparison.";

  const multiSource = new Set(models.map((m) => m.source)).size > 1;
  const cols = [
    "Model", "Creator", "Elo", "Score", "In$/1M", "Out$/1M", "tok/s",
    ...(multiSource ? ["Source"] : []),
  ];
  const rows = models.map((m) => [
    m.name,
    m.creator,
    m.elo_score != null ? String(m.elo_score) : "—",
    m.benchmark_score != null ? String(m.benchmark_score) : "—",
    m.pricing?.input_cost != null ? `$${m.pricing.input_cost.toFixed(2)}` : "—",
    m.pricing?.output_cost != null ? `$${m.pricing.output_cost.toFixed(2)}` : "—",
    m.performance?.throughput != null ? `${m.performance.throughput.toFixed(0)} tok/s` : "—",
    ...(multiSource ? [m.source] : []),
  ]);

  return [
    "## Model comparison",
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}
