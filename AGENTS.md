## Learned User Preferences

- Prefer taking full initiative: run commands, start services, and verify behavior in this environment instead of telling the user to perform manual setup or testing steps themselves.
- For repo-wide TypeScript tightening (replacing `any` or unjustified `unknown`), leave `./vendor/ai-researchwizard` out of scope unless the user explicitly includes it.

## Learned Workspace Facts

- PazaakWorld matchmaking and related server-side coordination are intended to run on Cloudflare via Wrangler, using Cloudflare platform features such as Durable Objects where they fit the primary server/data role.
- For KotOR-authentic color theming in PazaakWorld (including fixing mismatched labels like “KotOR classic”), reference OpenKotOR ModSync’s K1 and TSL theme definitions rather than inventing standalone palettes.
- **Trask Q&A:** Node side uses `@openkotor/trask` and `@openkotor/trask-http`; `apps/trask-http-server` can serve `vendor/qa-webui` and expose `/api/trask/*`. Research calls go to `vendor/ai-researchwizard` (GPTR). Python LLM fallback ordering comes from `vendor/llm_fallbacks` (`FREE_CHAT_MODELS` / `get_fallback_list("chat")`, not a `FREE_LLM_MODELS` env var). `loadSharedAiConfig` may fall back to `OPENROUTER_API_KEY` when `OPENAI_API_KEY` is unset for OpenAI-compatible clients (optional `OPENAI_BASE_URL` and OpenRouter headers).
