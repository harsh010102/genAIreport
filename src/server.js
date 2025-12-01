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
  const { researchPlan, projectStage } = req.body || {};

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
    let response = "";
    
    const stream = await openrouter.chat.send({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: BASE_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt({ researchPlan, projectStage }) },
      ],
      temperature: 0.35,
      max_tokens: 900,
      stream: true,
      streamOptions: {
        includeUsage: true,
      },
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        response += content;
      }
    }

    const checklist = response.trim();
    if (!checklist) {
      return res
        .status(502)
        .json({ error: "LLM returned an empty response. Please retry." });
    }

    res.json({ checklist });
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

