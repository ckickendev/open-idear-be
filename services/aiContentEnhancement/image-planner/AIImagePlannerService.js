const { providerRegistry } = require("../../../ai/provider");
const { aiLogger } = require("../../../ai/telemetry");
const { ImagePlanSchema } = require("../schemas");
const { imagePlannerPromptDefinition } = require("./imagePlanner.prompt");

class AIImagePlannerService {
  /**
   * Receives a Markdown article, analyzes headings/sections, and generates a validated ImagePlan.
   * @param {Object} input
   * @param {string} [input.title]
   * @param {string} input.markdownContent
   * @param {string} [input.userId]
   * @param {number} [input.maxImages]
   * @returns {Promise<import('../schemas').ImagePlan>}
   */
  async plan(input) {
    const startTime = Date.now();
    const { title = "Untitled Article", markdownContent, userId = "system", maxImages = 4 } = input;

    if (!markdownContent || !markdownContent.trim()) {
      return {
        articleTopic: "Empty Document",
        totalSuggestions: 0,
        suggestions: [],
      };
    }

    // 1. Analyze Markdown Section Hierarchy (skip trivial sections < 50 words)
    const sections = this.parseSections(markdownContent);
    const nonTrivialSections = sections.filter((s) => s.wordCount >= 50 || s.level <= 2);

    // 2. Fetch Provider
    const provider = providerRegistry.getDefault();
    const truncatedMarkdown = markdownContent.slice(0, 4000);
    const userMessageContent = `Article Title: ${title}\n\nSections Overview:\n${nonTrivialSections
      .map((s) => `[Block #${s.index}] H${s.level}: ${s.heading} (${s.wordCount} words)`)
      .join("\n")}\n\nDocument Content Excerpt:\n${truncatedMarkdown}`;

    const messages = [
      { role: "system", content: imagePlannerPromptDefinition.system },
      { role: "user", content: userMessageContent },
    ];

    // 3. Execute LLM Call
    try {
      const jsonResult = await provider.generateJSON(messages, {
        model: "fast",
        temperature: imagePlannerPromptDefinition.metadata.temperature,
        maxOutputTokens: imagePlannerPromptDefinition.metadata.maxTokens,
      });

      if (!jsonResult || !jsonResult.data) {
        throw new Error("Failed to receive structured response from AI provider");
      }

      // 4. Runtime Schema Validation via Zod
      const validatedPlan = ImagePlanSchema.parse(jsonResult.data);

      // Enforce business rule: Max 1 image per section & upper limit constraint
      const deduplicatedSuggestions = this.enforceSectionRules(validatedPlan.suggestions, maxImages);

      const finalPlan = {
        articleTopic: validatedPlan.articleTopic,
        totalSuggestions: deduplicatedSuggestions.length,
        suggestions: deduplicatedSuggestions,
      };

      // 5. Telemetry Logging (safe execution)
      try {
        const durationMs = Date.now() - startTime;
        if (aiLogger && typeof aiLogger.logRequest === "function") {
          aiLogger.logRequest({
            requestId: `img_plan_${Date.now()}`,
            timestamp: new Date().toISOString(),
            userId,
            featureId: "image_planner",
            providerId: provider.providerId,
            model: "gemini-2.5-flash",
            prompt: userMessageContent,
            response: JSON.stringify(finalPlan),
            tokens: jsonResult.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            durationMs,
            status: "success",
          });
        }
      } catch (telemetryErr) {
        console.warn("[AIImagePlannerService] Telemetry logging failed:", telemetryErr.message);
      }

      return finalPlan;
    } catch (err) {
      try {
        const durationMs = Date.now() - startTime;
        if (aiLogger && typeof aiLogger.logRequest === "function") {
          aiLogger.logRequest({
            requestId: `img_plan_err_${Date.now()}`,
            timestamp: new Date().toISOString(),
            userId,
            featureId: "image_planner",
            providerId: provider?.providerId || "unknown",
            model: "gemini-2.5-flash",
            prompt: userMessageContent,
            response: "",
            tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            durationMs,
            status: "error",
            error: { code: "EXECUTION_ERROR", message: err.message },
          });
        }
      } catch (telemetryErr) {
        console.warn("[AIImagePlannerService] Telemetry error logging failed:", telemetryErr.message);
      }

      console.error("[AIImagePlannerService] Planning failed, executing fallback analysis:", err.message);

      // Fallback Strategy: Generate basic local suggestions based on parsed headings
      return this.generateFallbackPlan(title, nonTrivialSections, maxImages);
    }
  }

  /**
   * Parses Markdown headings and block section offsets.
   */
  parseSections(markdown) {
    const blocks = markdown.split(/\n\n+/);
    const sections = [];

    blocks.forEach((block, idx) => {
      const trimmed = block.trim();
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);

      if (headingMatch) {
        sections.push({
          index: idx,
          heading: headingMatch[2].trim(),
          level: headingMatch[1].length,
          wordCount: 0,
        });
      } else if (sections.length > 0) {
        const words = trimmed.split(/\s+/).length;
        sections[sections.length - 1].wordCount += words;
      }
    });

    return sections;
  }

  /**
   * Enforces rules: Max 1 image per section heading & global max limit.
   */
  enforceSectionRules(suggestions, maxLimit) {
    const seenHeadings = new Set();
    const filtered = [];

    for (const sug of suggestions) {
      const normalizedHeading = sug.heading.toLowerCase().trim();
      if (!seenHeadings.has(normalizedHeading)) {
        seenHeadings.add(normalizedHeading);
        filtered.push(sug);
      }
      if (filtered.length >= maxLimit) break;
    }

    return filtered;
  }

  /**
   * Fallback heuristic generator if LLM service is unreachable.
   */
  generateFallbackPlan(title, sections, maxLimit) {
    const fallbackSuggestions = sections
      .slice(0, maxLimit)
      .map((sec) => ({
        heading: sec.heading,
        position: sec.index,
        type: sec.heading.toLowerCase().includes("setup") || sec.heading.toLowerCase().includes("install")
          ? "contextual-body"
          : sec.heading.toLowerCase().includes("architecture")
          ? "diagram-fallback"
          : "contextual-body",
        query: `${title} ${sec.heading}`.trim().toLowerCase(),
        alt: `${sec.heading} illustration`,
        priority: "medium",
      }));

    return {
      articleTopic: title,
      totalSuggestions: fallbackSuggestions.length,
      suggestions: fallbackSuggestions,
    };
  }
}

module.exports = new AIImagePlannerService();
