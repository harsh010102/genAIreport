import path from "path";
import express from "express";
import cors from "cors";
import { OpenRouter } from "@openrouter/sdk";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { BASE_SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "x-ai/grok-4.1-fast:free";

const openrouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    model: OPENROUTER_MODEL,
    hasKey: Boolean(OPENROUTER_API_KEY),
  });
});

app.post("/api/checklist", async (req, res) => {
  const { researchPlan, projectStage, config } = req.body || {};

  if (!researchPlan || researchPlan.trim().length < 25) {
    return res.status(400).json({
      error: "Please provide a research plan with at least 25 characters.",
    });
  }

  if (!OPENROUTER_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENROUTER_API_KEY. Set it in the environment." });
  }

  try {
    let responseText = "";

    // Build prompts with JSON-only requirement
    const prompts = buildUserPrompt({ researchPlan, projectStage, config });

    const stream = await openrouter.chat.send({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: prompts.system },
        { role: "user", content: prompts.user },
      ],
      temperature: config?.temperature ?? 0.35,
      max_tokens: config?.maxTokens ?? 900,
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        responseText += content;
      }
    }

    const trimmed = responseText.trim();
    if (!trimmed) {
      return res.status(502).json({ error: "LLM returned an empty response. Please retry." });
    }

    // Try to parse JSON from the model output
    let parsed = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      // try to extract JSON substring
      const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/m);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          parsed = null;
        }
      }
    }

    let checklistItems = null;
    if (parsed) {
      if (Array.isArray(parsed)) checklistItems = parsed;
      else if (Array.isArray(parsed.items)) checklistItems = parsed.items;
    }

    // If parsing failed, fall back to returning raw text (frontend will try to recover)
    const checklistPayload = checklistItems || trimmed;

    res.json({
      checklist: checklistPayload,
      generatedAt: new Date().toISOString(),
      projectStage,
      model: OPENROUTER_MODEL,
      raw: trimmed,
    });
  } catch (error) {
    console.error("OpenRouter error", error?.response?.data || error.message);
    const status = error?.response?.status || 500;
    const details =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error.message;
    res.status(status).json({
      error: "Unable to generate checklist right now.",
      details,
    });
  }
});

app.listen(PORT, () => {
  console.log(`GenAI reporting tool running on http://localhost:${PORT}`);
});

