## GenAI Reporting Checklist Builder

Prototype web app supporting the course project **“Reporting Standards in the GenAI Era – Designing a Tool for Research.”** Paste a research plan, optionally specify the project stage, and the app asks an LLM (DeepSeek via OpenRouter) to generate a tailored, theory-grounded reporting checklist.

### Features
- Opinionated system prompt that encodes minimal reporting standards for pre- vs post-GenAI methodology.
- Web UI with a single form for research plans, optional stage tags, and live status updates.
- Express backend that keeps the OpenRouter key server-side and exposes `/api/checklist`.
- Health endpoint (`/api/health`) to quickly verify configuration.

### Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create an env file**
   - Copy `env.example` to `.env`.
   - Set `OPENROUTER_API_KEY` to your OpenRouter key (e.g., the DeepSeek key you shared).
   - Optionally adjust `OPENROUTER_MODEL`, `PORT`, or `APP_BASE_URL`.
3. **Run the server**
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` and generate checklists. The backend serves the static UI and proxies requests to OpenRouter.

### Prompt Customization
- Tweak `src/prompt.js` to change the checklist structure, tone, or required sections.
- `buildUserPrompt` controls how researcher inputs and stage labels are injected.

### Deployment Notes
- The server is stateless; it can be hosted on any Node-friendly service (Render, Railway, etc.).
- Keep the OpenRouter key secret—never embed it in frontend code.
- Configure `APP_BASE_URL` to your deployed origin for OpenRouter analytics headers.

### Next Ideas
- Store generated checklists alongside project metadata for traceability.
- Add authentication or per-user rate limits if exposing publicly.
- Offer export formats (Markdown download, Google Docs, JSON schema).

