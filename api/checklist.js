const dotenv = require('dotenv');
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'x-ai/grok-4.1-fast:free';

function buildPrompts({ researchPlan, projectStage = 'unspecified', config = {} }) {
  const cfg = {
    modelName: config.modelName || '',
    systemPrompt: config.systemPrompt || '',
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens ?? 900,
    topP: config.topP ?? 1,
  };

  const system = [`You are an expert in responsible AI and reproducibility. Produce concise, practical reporting checklists tailored to the research plan provided.`, cfg.systemPrompt].filter(Boolean).join('\n\n');

  const user = `Given the research plan below, produce a JSON-only response with a top-level object:\n{\n  "items": [ { "category": "<short category>", "text": "<actionable requirement (<=280 chars)>" }, ... ]\n}\n\nREQUIREMENTS:\n1) OUTPUT must be valid JSON and only JSON. Do NOT include any markdown, explanation, or surrounding text.\n2) Provide between 6 and 12 actionable checklist items tailored to the research plan.\n3) Each item must include a concise \"category\" and a short \"text\" field (under 280 characters).\n4) Do NOT include the static reproducibility-tracking items (they will be merged client-side).\n\nContext:\n- Project stage: ${projectStage}\n- Initial LLM config: ${JSON.stringify(cfg)}\n\nResearch plan:\n${researchPlan}\n\nReturn JSON only.`;

  return { system, user };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { researchPlan, projectStage, config } = req.body || {};
  if (!researchPlan || researchPlan.trim().length < 25) {
    return res.status(400).json({ error: 'Please provide a research plan (>=25 chars).' });
  }

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY in environment.' });
  }

  try {
    const prompts = buildPrompts({ researchPlan, projectStage, config });

    const payload = {
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: prompts.system },
        { role: 'user', content: prompts.user },
      ],
      temperature: config?.temperature ?? 0.35,
      max_tokens: config?.maxTokens ?? 900,
    };

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || JSON.stringify(data);

    // Try parse
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const jsonMatch = String(raw).match(/\{[\s\S]*\}|\[[\s\S]*\]/m);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) { parsed = null; }
      }
    }

    let checklistItems = null;
    if (parsed) {
      if (Array.isArray(parsed)) checklistItems = parsed;
      else if (Array.isArray(parsed.items)) checklistItems = parsed.items;
    }

    return res.json({ checklist: checklistItems || raw, generatedAt: new Date().toISOString(), projectStage, model: OPENROUTER_MODEL, raw });
  } catch (err) {
    console.error('Checklist function error', err);
    return res.status(500).json({ error: 'Failed to generate checklist', details: String(err) });
  }
};
