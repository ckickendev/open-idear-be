import { z } from "zod";

// =============================================================================
//  COPILOT ACTION: CONTINUE WRITING — SCHEMAS
// =============================================================================

/**
 * Input payload contract for the Continue Writing action.
 */
export interface ContinueInput extends Record<string, any> {
  /** The text block immediately preceding the cursor position to guide continuation */
  readonly surroundingContext: string;
  /** Custom directives to guide the direction or style of the next words */
  readonly additionalInstructions?: string;
}

/**
 * Zod validation schema representing the expected continuation response structure.
 */
export const ContinueSchema = z.object({
  /** The raw text block continuation written by the copilot */
  text: z.string(),
});

/** Strongly typed representation of the Continue Writing output */
export type ContinueOutput = z.infer<typeof ContinueSchema>;


// =============================================================================
//  COPILOT ACTION: IMPROVE WRITING — SCHEMAS
// =============================================================================

/**
 * Input payload contract for the Improve Writing (inline rewrites) action.
 */
export interface ImproveInput extends Record<string, any> {
  /** The highlighted text block to edit/improve */
  readonly selectedText: string;
  /** The editing instruction, e.g. "make it concise", "fix passive voice" */
  readonly instruction: string;
  /** Surrounding text blocks to maintain narrative flow consistency */
  readonly surroundingContext?: string;
  /** Target reader audience */
  readonly audience?: string;
  /** Target writing tone */
  readonly tone?: string;
}

/**
 * Zod validation schema representing the expected rewrite edit response structure.
 */
export const ImproveSchema = z.object({
  /** The rewritten text block */
  improvedText: z.string(),
  /** Relative change in readability ease (Flesch readability difference scale, e.g. -5 to 5) */
  readabilityDelta: z.number().int(),
  /** Summary description of the edits executed */
  changesSummary: z.string(),
});

/** Strongly typed representation of the Improve Writing output */
export type ImproveOutput = z.infer<typeof ImproveSchema>;


// =============================================================================
//  COPILOT ACTION: GENERATE EXAMPLE — SCHEMAS
// =============================================================================

/**
 * Input payload contract for the Generate Example action.
 */
export interface ExampleInput extends Record<string, any> {
  /** The reference text or concept block highlighted by the editor */
  readonly selectedText: string;
  /** Extra guidelines, e.g. "include comments", "show error handlers" */
  readonly additionalInstructions?: string;
  /** Surrounding content for contextual vocabulary and tone matching */
  readonly surroundingContext?: string;
  /** Programming language or category context (e.g. "typescript", "yaml") */
  readonly language?: string;
  /** The title of the article document (topic context) */
  readonly articleTitle?: string;
  /** The target audience of the article */
  readonly audience?: string;
  /** The current active section title */
  readonly sectionTitle?: string;
}

/**
 * Zod validation schema representing the expected example illustration structure.
 */
export const ExampleSchema = z.object({
  /** The markdown codeblock or example illustration body content */
  markdown: z.string(),
});

/** Strongly typed representation of the Generate Example output */
export type ExampleOutput = z.infer<typeof ExampleSchema>;


// =============================================================================
//  COPILOT ACTION: REVIEW ARTICLE — SCHEMAS
// =============================================================================

/**
 * Input payload contract for the Review Article (peer review audit) action.
 */
export interface ReviewInput extends Record<string, any> {
  /** The full body content of the article draft to review */
  readonly currentArticle: string;
  /** The title of the article document */
  readonly articleTitle: string;
  /** The writing goal or objective */
  readonly goal?: string;
  /** The target audience */
  readonly audience?: string;
  /** The desired writing tone */
  readonly tone?: string;
}

/**
 * Zod validation schema representing the expected review audit report.
 */
export const ReviewSchema = z.object({
  /** Grammar score computed for this draft from 0 to 100 */
  grammarScore: z.number().int().min(0).max(100),
  /** Readability score computed for this draft from 0 to 100 */
  readabilityScore: z.number().int().min(0).max(100),
  /** Flag showing if code examples or illustrations are missing */
  missingExamples: z.boolean(),
  /** Flag showing if screenshots or diagrams are missing */
  missingImages: z.boolean(),
  /** Flag showing if a concluding summary section is missing */
  missingConclusion: z.boolean(),
  /** Technical refinement suggestions categorized by severity level and targets */
  suggestions: z.array(
    z.object({
      /** Severity rating of the issue */
      severity: z.enum(["low", "medium", "high"]),
      /** The target section title where the issue was flagged */
      section: z.string(),
      /** Human-readable explanation of how to address the issue */
      message: z.string(),
    })
  ),
});

/** Strongly typed representation of the Review Article output */
export type ReviewOutput = z.infer<typeof ReviewSchema>;
