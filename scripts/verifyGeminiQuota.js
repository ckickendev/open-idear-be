// scripts/verifyGeminiQuota.js
// Utility script to verify Gemini API connection, rate limits, and quota status.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = (process.env.GEMINI_API_KEY || process.env["GEMINI_API_KEY "] || "").trim();

if (!apiKey) {
  console.error("❌ No GEMINI_API_KEY found in .env");
  process.exit(1);
}

console.log(`\n======================================================`);
console.log(`🔍 Gemini API Health & Quota Diagnostic`);
console.log(`🔑 Key: ${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`);
console.log(`======================================================\n`);

async function testQuota() {
  const genAI = new GoogleGenerativeAI(apiKey);
  const testModels = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
  let hasFailure = false;

  for (const modelName of testModels) {
    process.stdout.write(`Testing model "${modelName}"... `);
    const startTime = Date.now();
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Respond with: OK" }] }],
        generationConfig: { maxOutputTokens: 10, temperature: 0.1 },
      });
      const response = result.response;
      const text = response.text().trim();
      const duration = Date.now() - startTime;
      console.log(`✅ OK (${duration}ms) [Tokens: ${response.usageMetadata?.totalTokenCount || 0}]`);
    } catch (err) {
      hasFailure = true;
      console.log(`❌ FAILED`);
      console.error(`   Error: ${err.message}`);
      if (err.message.includes("429") || err.message.includes("quota")) {
        console.error(`   ⚠️ Notice: Free tier daily quota or rate limit exceeded.`);
      }
    }
  }

  console.log(`\n======================================================`);
  if (!hasFailure) {
    console.log(`🎉 All Gemini models are reachable and healthy!`);
  } else {
    console.log(`⚠️ One or more models encountered quota or access errors.`);
  }
  console.log(`======================================================\n`);
}

testQuota();
