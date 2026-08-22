class MarkdownParserUtil {
  /**
   * Tokenizes markdown text into a line-by-line block structure for AST processing.
   */
  static parseBlocks(markdown) {
    if (!markdown) return [];

    const lines = markdown.split(/\r?\n/);
    const nodes = [];

    let inCodeBlock = false;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        nodes.push({
          lineIndex: idx,
          type: "code",
          cleanText: trimmed,
          rawLine: line,
        });
        return;
      }

      if (inCodeBlock) {
        nodes.push({
          lineIndex: idx,
          type: "code",
          cleanText: line,
          rawLine: line,
        });
        return;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        nodes.push({
          lineIndex: idx,
          type: "heading",
          headingLevel: headingMatch[1].length,
          cleanText: MarkdownParserUtil.normalizeHeadingText(headingMatch[2]),
          rawLine: line,
        });
        return;
      }

      if (!trimmed) {
        nodes.push({
          lineIndex: idx,
          type: "empty",
          cleanText: "",
          rawLine: line,
        });
        return;
      }

      nodes.push({
        lineIndex: idx,
        type: "paragraph",
        cleanText: trimmed,
        rawLine: line,
      });
    });

    return nodes;
  }

  /**
   * Normalizes heading text by stripping markdown links, inline code, and extra spaces.
   */
  static normalizeHeadingText(text) {
    return text
      .toLowerCase()
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim();
  }
}

class MarkdownEnhancerService {
  /**
   * Injects a list of ResolvedImages immediately after matching section headings or block offsets.
   * @param {string} originalMarkdown
   * @param {import('../schemas').ResolvedImage[]} resolvedImages
   * @param {Object} [options]
   */
  enhance(originalMarkdown, resolvedImages, options = {}) {
    const { ensureSpacing = true, captionStyle = "none" } = options;

    if (!originalMarkdown || !originalMarkdown.trim()) {
      return {
        enhancedMarkdown: originalMarkdown || "",
        insertedCount: 0,
        skippedImageIds: (resolvedImages || []).map((img) => img.id),
      };
    }

    if (!resolvedImages || resolvedImages.length === 0) {
      return {
        enhancedMarkdown: originalMarkdown,
        insertedCount: 0,
        skippedImageIds: [],
      };
    }

    const lines = originalMarkdown.split(/\r?\n/);
    const nodes = MarkdownParserUtil.parseBlocks(originalMarkdown);

    const insertedUrls = new Set();
    const headingInsertedLines = new Set();
    const skippedImageIds = [];

    resolvedImages.forEach((img) => {
      if (img.url && originalMarkdown.includes(img.url)) {
        insertedUrls.add(img.url);
      }
    });

    const insertionsByLineIndex = new Map();

    for (const image of resolvedImages) {
      if (!image.url || insertedUrls.has(image.url)) {
        skippedImageIds.push(image.id);
        continue;
      }

      const targetHeadingNode = this.findMatchingHeadingNode(nodes, image);
      let targetLineIdx = -1;

      if (targetHeadingNode) {
        targetLineIdx = targetHeadingNode.lineIndex;
      } else if (image.position >= 0 && image.position < nodes.length) {
        targetLineIdx = nodes[image.position].lineIndex;
      }

      if (targetLineIdx !== -1) {
        if (headingInsertedLines.has(targetLineIdx)) {
          skippedImageIds.push(image.id);
          continue;
        }

        const snippet = this.buildImageMarkdownSnippet(image, captionStyle);

        if (!insertionsByLineIndex.has(targetLineIdx)) {
          insertionsByLineIndex.set(targetLineIdx, []);
        }

        insertionsByLineIndex.get(targetLineIdx).push(snippet);
        insertedUrls.add(image.url);
        headingInsertedLines.add(targetLineIdx);
      } else {
        skippedImageIds.push(image.id);
      }
    }

    const enhancedLines = [];
    let insertedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      enhancedLines.push(lines[i]);

      if (insertionsByLineIndex.has(i)) {
        const snippetsToInsert = insertionsByLineIndex.get(i);

        snippetsToInsert.forEach((snippet) => {
          if (ensureSpacing) {
            enhancedLines.push("");
          }

          enhancedLines.push(snippet);
          insertedCount++;

          if (ensureSpacing && i < lines.length - 1 && lines[i + 1].trim() !== "") {
            enhancedLines.push("");
          }
        });
      }
    }

    return {
      enhancedMarkdown: enhancedLines.join("\n"),
      insertedCount,
      skippedImageIds,
    };
  }

  findMatchingHeadingNode(nodes, image) {
    const headings = nodes.filter((n) => n.type === "heading");

    if (headings.length === 0) return null;

    if (image.alt) {
      const normalizedAlt = MarkdownParserUtil.normalizeHeadingText(image.alt);
      const matchedByAlt = headings.find(
        (h) => h.cleanText.includes(normalizedAlt) || normalizedAlt.includes(h.cleanText)
      );
      if (matchedByAlt) return matchedByAlt;
    }

    if (typeof image.position === "number" && image.position >= 0) {
      const closestHeading = headings.find(
        (h) => Math.abs(h.lineIndex - image.position) <= 2
      );
      if (closestHeading) return closestHeading;
    }

    return null;
  }

  buildImageMarkdownSnippet(image, captionStyle) {
    const baseMarkdown = image.markdownSnippet || `![${image.alt || "Image"}](${image.url})`;

    if (captionStyle === "italic" && image.caption) {
      return `${baseMarkdown}\n*${image.caption}*`;
    }

    if (captionStyle === "figure" && image.caption) {
      return `<figure>\n  <img src="${image.url}" alt="${image.alt || ""}" />\n  <figcaption>${image.caption}</figcaption>\n</figure>`;
    }

    return baseMarkdown;
  }
}

module.exports = {
  MarkdownParserUtil,
  MarkdownEnhancerService: new MarkdownEnhancerService(),
};
