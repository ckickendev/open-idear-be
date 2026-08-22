class MarkdownEnhancer {
  /**
   * Transforms document AST by inserting resolved placements and serializing final output.
   * @param {import('./types').DocumentContext} context
   * @param {import('./types').ResolvedPlacement[]} placements
   * @returns {{ enhancedMarkdown: string, enhancedHtml: string, appliedLog: string[] }}
   */
  enhance(context, placements) {
    if (!placements || placements.length === 0) {
      return {
        enhancedMarkdown: context.rawMarkdown,
        enhancedHtml: "",
        appliedLog: [],
      };
    }

    // Sort placements in descending order of insertAfterIndex to perform safe bottom-to-top AST insertions
    const sortedPlacements = [...placements].sort(
      (a, b) => b.insertAfterIndex - a.insertAfterIndex
    );

    const blocks = context.rawMarkdown.split(/\n\n+/);
    const appliedLog = [];

    sortedPlacements.forEach((placement) => {
      const idx = placement.insertAfterIndex;
      if (idx >= 0 && idx < blocks.length) {
        // Insert after target block
        blocks.splice(idx + 1, 0, placement.content);
        appliedLog.push(`Inserted ${placement.type} at block ${idx + 1}`);
      } else if (blocks.length > 0) {
        // Fallback: append to end
        blocks.push(placement.content);
        appliedLog.push(`Appended ${placement.type} to end`);
      }
    });

    const enhancedMarkdown = blocks.join("\n\n");

    return {
      enhancedMarkdown,
      enhancedHtml: "", // HTML conversion handles client-side parser or TipTap
      appliedLog,
    };
  }
}

module.exports = new MarkdownEnhancer();
