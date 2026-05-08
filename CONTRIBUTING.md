# Contributing

Thanks for your interest. The most useful contributions right now are **new data sources** and **better recommendation scoring**.

## Adding a new data source

The architecture is built around a single normalised shape, [`RankedModel`](src/types.ts). Every source service exports a `fetch*()` function that returns `RankedModel[]`. Adding a new source is four steps:

1. **Create a service file** in `src/services/` (e.g. `lmarena.ts`). Implement a `fetch*()` that hits the upstream API and maps each entry to `RankedModel`. Use the existing `apiGet` helper from `services/api-client.ts` and the `cacheGet` / `cacheSet` helpers from `services/cache.ts`.
2. **Add the source to the type union** in `src/types.ts` (`DataSource`) and to the Zod enum in `src/schemas/index.ts` (`DataSourceSchema`).
3. **Wire it into `getModelsFromSource`** in `src/tools/handlers.ts` — both the dedicated `case` and the `case "all"` branch. Wrap the call in `safeCall` so a failed source doesn't take the whole response down.
4. **Update the README and the `ranking_get_leaderboard` description** in `src/index.ts` so the new source is discoverable.

After that, `npm run build` and try a smoke-test (see below).

## Candidate sources we'd love to see

| Source | Modalities | Why it matters |
|--------|-----------|----------------|
| **LMArena / LMSYS** | Text | Chatbot Arena Elo — gold standard for LLM evaluation. Available as a Hugging Face dataset (`lmsys/chatbot_arena_leaderboard`). |
| **Arena.ai** | Image | 5M+ community votes for image generation. Likely needs scraping. |
| **VBench** | Video | 16-dimension video quality evaluation. Available as a Hugging Face Space. |
| **HF TTS Arena** | Audio | Community-voted TTS quality rankings. |
| **Replicate** | All | API catalog with active models. |
| **Together AI** | Text | 200+ models, unified API. |

## Improving the recommend tool

`handleRecommend` in `src/tools/handlers.ts` currently uses a simple linear scorer over Elo, throughput, latency, and price. Concrete things to do:

- Normalise scores per-modality so an image Elo isn't being added to a text Elo on different scales.
- Extract keywords from the `use_case` prompt and match against model tags, names, and (where available) descriptions.
- When the use case maps to a BenchLM category (e.g. "best for coding"), prefer BenchLM's category-specific scores.

## Local development

```bash
npm install
cp .env.example .env  # fill in your AA key
npm run build
# stdio (default)
npm start
# or HTTP
TRANSPORT=http PORT=3000 npm start
```

## Pull request etiquette

- One source / feature per PR.
- Run `npm run build` before opening — the CI workflow runs the same compile.
- If you add a source, include a short note in the README about how to authenticate it.
- No automated tests in the repo yet — manual smoke-test is enough. Mention what you tested in the PR body.
