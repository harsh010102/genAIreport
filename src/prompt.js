const BASE_SYSTEM_PROMPT = `
You are an expert in responsible AI, research methodology, and reproducibility.
Produce concise, practical reporting checklists tailored to the research plan provided.
Be precise and avoid any conversational text unless explicitly requested.
`.trim();

/**
 * Build a user prompt that forces the LLM to return JSON only.
 * Returns an object: { system: string, user: string }
 */
const buildUserPrompt = ({ researchPlan, projectStage = "unspecified", config = {} }) => {
  const cfg = {
    modelName: config.modelName || "",
    systemPrompt: config.systemPrompt || "",
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens ?? 900,
    topP: config.topP ?? 1,
  };

  const system = [BASE_SYSTEM_PROMPT, cfg.systemPrompt].filter(Boolean).join("\n\n");

  const user = `
Given the research plan below, produce a JSON-only response with a top-level object:
{
  "items": [ { "category": "<short category>", "text": "<actionable requirement (<=280 chars)>" }, ... ]
}

REQUIREMENTS:
1) OUTPUT must be valid JSON and only JSON. Do NOT include any markdown, explanation, or surrounding text.
2) Provide between 6 and 12 actionable checklist items tailored to the research plan.
3) Each item must include a concise "category" and a short "text" field (under 280 characters).
4) Do NOT include the static reproducibility-tracking items (they will be merged client-side).
5) Keep language neutral and directly relevant to reproducibility (what to record, how often, what to save).

Context:
- Project stage: ${projectStage}
- Initial LLM config: ${JSON.stringify(cfg)}

Research plan:
${researchPlan}

Return JSON only.
`.trim();

  return { system, user };
};

export {
  BASE_SYSTEM_PROMPT,
  buildUserPrompt,
};

