/**
 * Core interfaces & data contracts for the AI Content Enhancement Pipeline.
 */

/**
 * @typedef {Object} ASTNode
 * @property {'heading' | 'paragraph' | 'list' | 'code' | 'blockquote' | 'hr'} type
 * @property {number} index
 * @property {number} level - Heading level (1-6) if type is 'heading'
 * @property {string} text - Raw text content of the node
 * @property {string} raw - Full markdown source of the node
 */

/**
 * @typedef {Object} DocumentContext
 * @property {string} rawMarkdown
 * @property {ASTNode[]} ast
 * @property {number} totalWords
 * @property {number} totalParagraphs
 * @property {string} topic
 * @property {string[]} keyThemes
 */

/**
 * @typedef {Object} EnhancementIntent
 * @property {string} id
 * @property {'image' | 'faq' | 'table' | 'diagram' | 'link'} type
 * @property {number} insertAfterIndex - AST node index to insert after
 * @property {string} searchQuery - Search query or visual prompt
 * @property {string} [altText]
 * @property {Object} [payload] - Additional payload specific to plugin type
 */

/**
 * @typedef {Object} ResolvedPlacement
 * @property {string} id
 * @property {'image' | 'faq' | 'table' | 'diagram' | 'link'} type
 * @property {number} insertAfterIndex
 * @property {string} content - Markdown formatted snippet to insert
 * @property {string} [url]
 * @property {string} [altText]
 * @property {string} [mediaId]
 */

/**
 * @typedef {Object} EnhancementResult
 * @property {string} enhancedMarkdown
 * @property {ResolvedPlacement[]} insertedAssets
 * @property {string[]} appliedEnhancements
 * @property {number} executionTimeMs
 */

module.exports = {};
