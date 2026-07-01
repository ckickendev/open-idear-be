const { Service } = require("../core");
const { MediaAsset } = require("../models");
const { providerRegistry, promptRegistry } = require("../ai");

class AISuggestionService extends Service {
  /**
   * Suggests relevant images from the user's Media Library based on the editor's text content.
   */
  async suggestImages(userId, editorContent) {
    if (!editorContent || editorContent.trim() === "") {
      return [];
    }

    // 1. Truncate editor content to prevent exceeding prompt tokens (max 3000 chars)
    const truncatedContent = editorContent.slice(-3000);

    // 2. Load and call Gemini to extract search queries and keywords
    const provider = providerRegistry.getDefault();
    const promptDef = await promptRegistry.get("suggest", "v1");
    const system = promptDef.system || "You are an expert content analyzer.";

    const messages = [
      { role: "system", content: system },
      {
        role: "user",
        content: `Analyze this article content:\n${truncatedContent}`,
      },
    ];

    const result = await provider.generateJSON(messages, {
      model: "fast", // fast execution since we want a quick response
      temperature: promptDef.metadata?.temperature ?? 0.2,
      maxOutputTokens: promptDef.metadata?.maxTokens ?? 300,
    });

    if (!result || !result.data) {
      throw new Error("Failed to extract keywords from content.");
    }

    const searchQueries = Array.isArray(result.data.searchQueries) ? result.data.searchQueries : [];
    const keywords = Array.isArray(result.data.keywords) ? result.data.keywords.map(k => k.toLowerCase()) : [];

    if (searchQueries.length === 0 && keywords.length === 0) {
      return [];
    }

    // 3. Search MongoDB for potential image candidates
    // Formulate a text search string combining extracted visual queries
    const textQuery = searchQueries.join(" ");

    // Query filters: must belong to the user, not deleted, and match keywords OR text search
    const query = {
      user: userId,
      del_flag: 0,
      $or: [],
    };

    if (keywords.length > 0) {
      query.$or.push({ tags: { $in: keywords } });
    }
    if (textQuery.trim() !== "") {
      query.$or.push({ $text: { $search: textQuery } });
    }

    // Fallback if no search criteria was generated
    if (query.$or.length === 0) {
      return [];
    }

    // Execute query fetching the candidates
    const candidates = await MediaAsset.find(
      query,
      { score: { $meta: "textScore" } }
    ).lean();

    // 4. Rank and Score Candidates
    const rankedCandidates = candidates.map((asset) => {
      let score = 0;

      // ─── Factor A: Tags Intersection (Weight: 10 per tag match) ───
      if (asset.tags && Array.isArray(asset.tags)) {
        const matchingTags = asset.tags.filter(tag => keywords.includes(tag.toLowerCase()));
        score += matchingTags.length * 10;
      }

      // ─── Factor B: Filename Substring Matches (Weight: 5 per keyword match) ───
      const filename = (asset.originalFilename || "").toLowerCase();
      keywords.forEach((keyword) => {
        if (filename.includes(keyword)) {
          score += 5;
        }
      });

      // ─── Factor C: Alt Text & Description matches (Weight: 3 per keyword match) ───
      const altText = (asset.altText || "").toLowerCase();
      const description = (asset.description || "").toLowerCase();
      keywords.forEach((keyword) => {
        if (altText.includes(keyword)) {
          score += 3;
        }
        if (description.includes(keyword)) {
          score += 3;
        }
      });

      // ─── Factor D: MongoDB Full Text Score (Weight: 4x text score multiplier) ───
      if (asset.score) {
        score += asset.score * 4;
      }

      // FUTURE EXTENSIBILITY NOTE:
      // When implementing Semantic Embeddings:
      // 1. Generate text embedding for `truncatedContent` using an embeddings model (e.g. text-embedding-004).
      // 2. Perform vector search in MongoDB Atlas Vector Search against the `asset.embedding` field.
      // 3. Add cosine similarity score * weight to the final ranking score.

      return {
        ...asset,
        rankingScore: score,
      };
    });

    // 5. Sort candidates descending and return the top 8 suggestions
    return rankedCandidates
      .filter(item => item.rankingScore > 0) // Only return items with actual keyword/text matches
      .sort((a, b) => b.rankingScore - a.rankingScore)
      .slice(0, 8);
  }
}

module.exports = new AISuggestionService();
