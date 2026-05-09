# Contributing to GenCurator

Contributions are very welcome — from data engineers wiring up a new source to creative professionals who know which model actually works for their craft.

This document covers everything from first-time setup to opening a PR.

---

## Ways to contribute

| Type | Examples | Difficulty |
|------|----------|------------|
| **New data source** | LMArena, Arena.ai, VBench, Replicate | Medium |
| **Better recommendation scoring** | Per-modality normalisation, creative task matching | Medium |
| **Qualitative model tags** | A curated JSON file: "strong at illustration", "good for photorealism" | Easy |
| **Bug fix** | Wrong field mapping, incorrect deduplication, broken cache key | Easy–Medium |
| **New MCP client docs** | Install instructions for a client not in the README | Easy |
| **Creative use case examples** | Better examples in tool descriptions for photographers, video editors, etc. | Easy |

---

## First-time setup

```bash
git clone https://github.com/thirdeye-media/gencurator-mcp.git
cd gencurator-mcp
npm install
cp .env.example .env
# Fill in ARTIFICIAL_ANALYSIS_API_KEY (free at https://artificialanalysis.ai/)
npm run build
npm start   # starts the server on stdio
```

To run as HTTP for easier manual testing:

```bash
TRANSPORT=http PORT=3000 npm start
# then in another terminal:
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## Adding a new data source

The architecture is built around a single normalised shape — [`RankedModel`](src/types.ts). Every source service exports a `fetch*()` function that returns `RankedModel[]`. Four steps:

### Step 1 — Create a service file

Add `src/services/your-source.ts`. Use the existing helpers:

```ts
import { apiGet } from "./api-client.js";         // HTTP GET with timeout
import { cacheGet, cacheSet } from "./cache.js";   // 1-hour TTL cache
import { CACHE_TTL_MS } from "../constants.js";
```

Implement `fetch*() → Promise<RankedModel[]>`. Map every field you can from the upstream API response to `RankedModel`. Fields you can't fill in go to `null` — that's fine.

Before returning, always run `cacheSet(key, models, CACHE_TTL_MS)` so repeated calls don't hit the API again within the hour.

**Token efficiency note:** keep `tags` short — 2–4 tags per model max. The tags array appears in markdown output; every extra tag costs tokens in the client's context window. Prefer putting rich data in the typed fields (`elo_score`, `benchmark_score`, `pricing`, `performance`) rather than stuffing it into tags.

### Step 2 — Update types and schemas

In [`src/types.ts`](src/types.ts), add your source name to the `DataSource` union:

```ts
export type DataSource =
  | "artificial_analysis"
  | "huggingface"
  | "openrouter"
  | "benchlm"
  | "your-source";   // ← add here
```

In [`src/schemas/index.ts`](src/schemas/index.ts), add it to `DataSourceSchema`:

```ts
export const DataSourceSchema = z.enum([
  "artificial_analysis", "huggingface", "openrouter", "benchlm",
  "your-source",   // ← add here
  "all"
]);
```

### Step 3 — Wire into handlers

In [`src/tools/handlers.ts`](src/tools/handlers.ts), add a `case` to `getModelsFromSource` and add your fetch call to the `case "all"` branch:

```ts
case "your-source": {
  const r = await safeCall("your-source", () => fetchYourSource({ limit }));
  if (r.warning) warnings.push(r.warning);
  return { models: r.value, warnings };
}
```

In the `"all"` branch:

```ts
tasks.push(
  safeCall("your-source", () => fetchYourSource({ limit: Math.min(limit, 10) }))
    .then((r) => ({ source: "your-source", value: r.value, warning: r.warning }))
);
```

Always wrap with `safeCall` — this ensures a failing source never takes down the whole response.

### Step 4 — Update the README

Add a row to the data sources table in `README.md`. If the source requires an API key, add it to `.env.example` and mention it in the README.

Update the `description` of `ranking_get_leaderboard` in [`src/index.ts`](src/index.ts) to include the new source name in the list.

### Step 5 — Smoke-test

```bash
npm run build
```

Then test manually. The easiest way is over stdio:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ranking_get_leaderboard","arguments":{"modality":"text","source":"your-source","limit":3,"response_format":"markdown"}}}' \
| node dist/index.js 2>/dev/null
```

---

## Candidate sources we'd love to see

| Source | Modalities | Why it matters | Notes |
|--------|-----------|----------------|-------|
| **LMArena / LMSYS** | Text | Chatbot Arena Elo — the gold standard for LLM quality | HF dataset `lmsys/chatbot_arena_leaderboard` or scrape the HF Space |
| **Arena.ai** | Image | 5M+ community votes for image generation | No public API — likely needs scraping |
| **VBench** | Video | 16-dimension video quality evaluation | Available as a HF Space (`Vchitect/VBench_Leaderboard`) |
| **HF TTS Arena** | Audio | Community-voted TTS quality | HF Space, no public API yet |
| **Replicate** | All | Active model catalog with standardised pricing | `replicate.com/docs/reference/http` |
| **Together AI** | Text | 200+ models, unified API, competitive pricing | `docs.together.ai` |
| **FAL.ai** | Image / Video | Fast inference, popular with creative workflows | `fal.ai/docs` |
| **ASCIIEval** | Text | 3,500+ samples testing how well models handle ASCII art (recognition + generation) | Academic benchmark — not yet in any live API. Paper: `arxiv.org/abs/2410.01733`. Would need a hosted leaderboard or self-run evals to integrate. |

---

## Improving recommendation scoring for creative tasks

`handleRecommend` in [`src/tools/handlers.ts`](src/tools/handlers.ts) currently scores models on a simple linear function over Elo, benchmark, throughput, latency, and price. It works, but it's not creative-task-aware.

Concrete improvements that would help:

**Per-modality score normalisation.** An image Elo of 1300 and a text benchmark score of 85 are on completely different scales. Normalising each to 0–100 within its modality before combining would make the quality weight meaningful across tools.

**Creative task keyword matching.** If the `use_case` prompt contains "illustration", "photorealistic", "voiceover", "music", or similar creative-domain words, the scorer could boost models whose tags or descriptions match. This is the clearest gap for creative professionals.

**BenchLM category routing.** When a text use case clearly maps to a BenchLM category (e.g. "coding", "reasoning"), the scorer could use BenchLM's category-specific score as the quality signal instead of the overall score.

**Qualitative model tags (most impactful for creatives).** A curated JSON file — e.g. `src/data/model-notes.json` — where anyone can annotate a model with qualitative notes. Something like:

```json
{
  "stabilityai/sdxl": {
    "strengths": ["photorealism", "product photography", "portraits"],
    "weaknesses": ["text in image", "hands"]
  },
  "black-forest-labs/flux-1.1-pro": {
    "strengths": ["illustration", "concept art", "stylised"],
    "weaknesses": []
  }
}
```

The scorer would then match `use_case` keywords against `strengths` and boost accordingly. This requires no API calls and directly serves the creative professional use case. It's the single improvement most likely to make the `ranking_recommend` tool feel magical.

---

## Code conventions

- **TypeScript strict mode** — no `any`, no `!` assertions unless truly unavoidable.
- **No comments** unless the *why* is non-obvious (a hidden constraint, a workaround for an API quirk). Don't explain what the code does.
- **No error suppression** — if a source fails, `safeCall` catches it and it becomes a warning. Don't silently swallow errors elsewhere.
- **Token efficiency** — responses are read by an LLM. Prefer tables over repeated labelled blocks. Keep tags short. If you add a field that appears per-model in the output, consider whether it justifies the token cost.

---

## PR checklist

- [ ] `npm run build` passes with no errors
- [ ] `npm run lint` passes with no errors
- [ ] Manually tested the affected tool(s) via stdio or HTTP
- [ ] One PR per source / feature — keep scope small
- [ ] If you added a source: data sources table updated in `README.md`, `.env.example` updated if a key is needed
- [ ] PR body describes what you tested and any rough edges you found

## Automated checks

Every PR runs three GitHub Actions workflows:

| Workflow | What it checks |
|----------|---------------|
| **CI / lint** | ESLint with TypeScript-strict rules — no `any`, no `!` assertions |
| **CI / build** | TypeScript compilation on Node 20 and 22 |
| **Smoke Test** | MCP server starts, completes the protocol handshake, and returns all expected tools |

The smoke test requires no API keys — it only exercises the protocol layer and `tools/list`. If your change affects tool registration in `src/index.ts`, verify the smoke test still passes locally:

```bash
npm run build
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node dist/index.js 2>/dev/null
```

---

## Questions?

Open an issue. If you're unsure whether an idea fits, open a discussion issue first — happy to give feedback before you write code.
