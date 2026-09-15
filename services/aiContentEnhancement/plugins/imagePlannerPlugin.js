const { providerRegistry } = require("../../../ai");

class ImagePlannerPlugin {
  constructor() {
    this.pluginId = "image-planner";
    this.priority = 10;
  }

  /**
   * Plans image placement locations and search queries based on DocumentContext.
   * @param {import('../types').DocumentContext} context
   * @returns {Promise<import('../types').EnhancementIntent[]>}
   */
  async plan(context) {
    if (!context.ast || context.ast.length === 0) {
      return [];
    }

    // Identify target insertion points (e.g., after H2 headings or long text sections)
    const targetPoints = [];
    let wordAcc = 0;

    context.ast.forEach((node, i) => {
      wordAcc += (node.text || "").split(/\s+/).length;

      // Primary insertion slot: after H2 or H3 heading section
      if (node.type === "heading" && (node.level === 2 || node.level === 3)) {
        if (i > 0) {
          targetPoints.push({
            insertAfterIndex: i,
            contextSnippet: node.text,
          });
        }
      } else if (wordAcc >= 300) {
        // Secondary insertion slot: every ~300 words
        targetPoints.push({
          insertAfterIndex: node.index,
          contextSnippet: node.text,
        });
        wordAcc = 0;
      }
    });

    // Limit image suggestions (max 4 per article)
    const slotsToPlan = targetPoints.slice(0, 4);
    if (slotsToPlan.length === 0 && context.ast.length > 1) {
      slotsToPlan.push({
        insertAfterIndex: 1,
        contextSnippet: context.topic,
      });
    }

    // Generate visual search queries using LLM
    const intents = [];
    for (let slotIdx = 0; slotIdx < slotsToPlan.length; slotIdx++) {
      const slot = slotsToPlan[slotIdx];
      try {
        const queryData = await this._generateVisualQuery(context.topic, slot.contextSnippet);
        intents.push({
          id: `img_intent_${slot.insertAfterIndex}_${slotIdx}`,
          type: "image",
          insertAfterIndex: slot.insertAfterIndex,
          searchQuery: queryData.searchQuery,
          altText: queryData.altText || queryData.searchQuery,
        });
      } catch (err) {
        console.warn("[ImagePlannerPlugin] Failed to generate visual query:", err.message);
      }
    }

    return intents;
  }

  /**
   * Calls AI provider to construct an effective visual search prompt & alt text.
   */
  async _generateVisualQuery(topic, sectionSnippet) {
    const provider = providerRegistry.getDefault();
    const prompt = `Based on topic "${topic}" and section context "${sectionSnippet}", specify a concise visual image search query (3-5 English keywords) and descriptive alt text. Output JSON only: {"searchQuery": "...", "altText": "..."}`;

    const response = await provider.generate([{ role: "user", content: prompt }], {
      temperature: 0.2,
    });

    const cleaned = response.text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

module.exports = new ImagePlannerPlugin();
