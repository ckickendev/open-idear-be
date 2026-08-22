const { providerRegistry } = require("../../ai");

class ContentAnalyzer {
  /**
   * Tokenizes markdown text into AST nodes and extracts document context.
   * @param {string} rawMarkdown
   * @returns {Promise<import('./types').DocumentContext>}
   */
  async analyze(rawMarkdown) {
    if (!rawMarkdown || typeof rawMarkdown !== "string") {
      return {
        rawMarkdown: "",
        ast: [],
        totalWords: 0,
        totalParagraphs: 0,
        topic: "General",
        keyThemes: [],
      };
    }

    // 1. Parse AST Nodes from markdown line blocks
    const ast = this._parseAST(rawMarkdown);

    const totalWords = rawMarkdown.trim().split(/\s+/).filter(Boolean).length;
    const totalParagraphs = ast.filter((n) => n.type === "paragraph").length;

    // 2. Extract topic and key themes using LLM (if content exists)
    let topic = "General Article";
    let keyThemes = [];

    if (totalWords > 20) {
      try {
        const summary = await this._extractContext(rawMarkdown.slice(0, 2000));
        if (summary.topic) topic = summary.topic;
        if (Array.isArray(summary.keyThemes)) keyThemes = summary.keyThemes;
      } catch (err) {
        console.warn("[ContentAnalyzer] Failed to extract LLM context:", err.message);
      }
    }

    return {
      rawMarkdown,
      ast,
      totalWords,
      totalParagraphs,
      topic,
      keyThemes,
    };
  }

  /**
   * Parses Markdown lines into a lightweight AST structure.
   */
  _parseAST(markdown) {
    const blocks = markdown.split(/\n\n+/);
    const ast = [];

    blocks.forEach((block, idx) => {
      const trimmed = block.trim();
      if (!trimmed) return;

      if (trimmed.startsWith("#")) {
        const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
          ast.push({
            type: "heading",
            index: idx,
            level: match[1].length,
            text: match[2].trim(),
            raw: block,
          });
          return;
        }
      }

      if (trimmed.startsWith("```")) {
        ast.push({
          type: "code",
          index: idx,
          level: 0,
          text: trimmed,
          raw: block,
        });
        return;
      }

      if (trimmed.startsWith(">")) {
        ast.push({
          type: "blockquote",
          index: idx,
          level: 0,
          text: trimmed.replace(/^>\s*/mg, ""),
          raw: block,
        });
        return;
      }

      if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
        ast.push({
          type: "list",
          index: idx,
          level: 0,
          text: trimmed,
          raw: block,
        });
        return;
      }

      ast.push({
        type: "paragraph",
        index: idx,
        level: 0,
        text: trimmed.replace(/[*_#`[\]()]/g, ""),
        raw: block,
      });
    });

    return ast;
  }

  /**
   * Calls AI provider to extract topic & themes.
   */
  async _extractContext(sampleText) {
    const provider = providerRegistry.getDefault();
    const prompt = `Analyze this article excerpt and output valid JSON with two fields: "topic" (string summary of main topic) and "keyThemes" (array of up to 4 strings). Do NOT include markdown code blocks or text outside JSON.\n\nExcerpt:\n${sampleText}`;

    const response = await provider.generate([{ role: "user", content: prompt }], {
      temperature: 0.1,
    });

    const cleaned = response.text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

module.exports = new ContentAnalyzer();
