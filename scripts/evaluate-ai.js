require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_MODEL,
  PROMPT_VERSION,
  classifyWebsiteWithUsage,
} = require("../aiClassifier");

const casesPath = path.join(__dirname, "..", "eval", "cases.json");
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
const dryRun = process.argv.includes("--dry-run");

function validateCases(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Evaluation dataset must contain at least one case");
  }

  for (const item of items) {
    for (const key of [
      "id",
      "url",
      "title",
      "text",
      "expectedCategories",
      "expectedRiskLevels",
    ]) {
      if (!item[key] || item[key].length === 0) {
        throw new Error(`Evaluation case ${item.id ?? "unknown"} is missing ${key}`);
      }
    }
  }
}

async function main() {
  validateCases(cases);

  if (dryRun) {
    console.log(`Evaluation dataset is valid (${cases.length} cases).`);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to run the AI evaluation");
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  let categoryMatches = 0;
  let riskMatches = 0;
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  console.log(`Model: ${model}`);
  console.log(`Prompt version: ${PROMPT_VERSION}`);

  for (const item of cases) {
    const response = await classifyWebsiteWithUsage(
      {
        url: item.url,
        title: item.title,
        description: item.description ?? "",
        text: item.text,
        truncated: false,
      },
      { apiKey: process.env.OPENAI_API_KEY, model }
    );
    const result = response.classification;
    const categoryMatch = item.expectedCategories.includes(result.category);
    const riskMatch = item.expectedRiskLevels.includes(result.riskLevel);
    if (categoryMatch) categoryMatches += 1;
    if (riskMatch) riskMatches += 1;
    totalCostUsd += response.cost?.estimatedCostUsd ?? 0;
    totalInputTokens += response.cost?.inputTokens ?? 0;
    totalOutputTokens += response.cost?.outputTokens ?? 0;

    console.log(
      JSON.stringify({
        id: item.id,
        category: result.category,
        riskLevel: result.riskLevel,
        categoryMatch,
        riskMatch,
        costUsd: response.cost?.estimatedCostUsd ?? null,
        inputTokens: response.cost?.inputTokens ?? null,
        outputTokens: response.cost?.outputTokens ?? null,
      })
    );
  }

  console.log(
    JSON.stringify({
      total: cases.length,
      categoryAccuracy: categoryMatches / cases.length,
      riskAccuracy: riskMatches / cases.length,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      averageCostUsd: totalCostUsd / cases.length,
    })
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
