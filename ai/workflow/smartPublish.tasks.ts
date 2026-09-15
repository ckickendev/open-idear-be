import { aiExecutionFacade } from "../execution";
import type { DescriptionResult, TagsResult, CategoryDetectionResult, SEOValidation, SEOIssue } from "./smartPublish.schema";
import { DescriptionResultSchema, TagsResultSchema, CategoryDetectionResultSchema } from "./smartPublish.schema";

const Post = require("../../models/post.schema");
const Tag = require("../../models/tag.schema");
const Category = require("../../models/category.schema");

/**
 * =============================================================================
 *  SMART PUBLISH TASKS
 *  ai/workflow/smartPublish.tasks.ts
 *
 *  Design Decisions:
 *  - Each AI task is an independent composable function (not a monolith prompt).
 *  - Uses aiExecutionFacade.execute() with inline messages for focused prompts.
 *  - Non-AI tasks (slug, readTime) are pure deterministic functions.
 *  - All AI outputs are Zod-validated before returning.
 * =============================================================================
 */

// ─── Task 1: Generate SEO Description ───────────────────────────────────────

export async function generateDescription(
  title: string,
  content: string,
  signal?: AbortSignal
): Promise<DescriptionResult> {
  const truncatedContent = content.slice(0, 3000);

  const result = await aiExecutionFacade.execute<DescriptionResult>({
    scope: "publishing",
    messages: [
      {
        role: "system" as const,
        content: `You are an SEO specialist. Generate a compelling meta description for a blog article.
Rules:
- Between 120 and 155 characters (ideal for Google SERP snippets).
- Include the main topic keyword naturally.
- Use an active voice and include a call-to-action or value proposition.
- Do NOT use quotes or special characters.
Respond ONLY with valid JSON: { "description": "..." }`,
      },
      {
        role: "user" as const,
        content: `Title: ${title}\n\nArticle excerpt:\n${truncatedContent}`,
      },
    ],
    responseFormat: "json",
    defaultModel: "fast",
    schema: DescriptionResultSchema,
    ...(signal !== undefined && { signal }),
  });

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || "Failed to generate description");
  }

  return result.data;
}

// ─── Task 2: Suggest Tags ────────────────────────────────────────────────────

export async function suggestTags(
  title: string,
  content: string,
  signal?: AbortSignal
): Promise<TagsResult> {
  // Fetch existing tags to prefer them
  let existingTagNames: string[] = [];
  try {
    const tags = await Tag.find({ del_flag: 0 }).select("name").lean();
    existingTagNames = tags.map((t: any) => t.name);
  } catch {
    // Proceed without existing tags
  }

  const truncatedContent = content.slice(0, 3000);
  const existingTagsList = existingTagNames.length > 0
    ? `\nExisting tags in the system (prefer these when relevant): [${existingTagNames.join(", ")}]`
    : "";

  const result = await aiExecutionFacade.execute<TagsResult>({
    scope: "publishing",
    messages: [
      {
        role: "system" as const,
        content: `You are a content categorization expert. Suggest 3 to 7 relevant tags for a blog article.
Rules:
- Tags should be lowercase, single words or short phrases (max 3 words).
- Include a mix of broad topic tags and specific technical tags.
- Prefer existing tags when they match the content.${existingTagsList}
- Do NOT invent overly generic tags like "technology" or "article".
Respond ONLY with valid JSON: { "tags": ["tag1", "tag2", ...] }`,
      },
      {
        role: "user" as const,
        content: `Title: ${title}\n\nArticle excerpt:\n${truncatedContent}`,
      },
    ],
    responseFormat: "json",
    defaultModel: "fast",
    schema: TagsResultSchema,
    ...(signal !== undefined && { signal }),
  });

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || "Failed to suggest tags");
  }

  return result.data;
}

// ─── Task 3: Detect Category ─────────────────────────────────────────────────

export async function detectCategory(
  title: string,
  content: string,
  signal?: AbortSignal
): Promise<CategoryDetectionResult> {
  // Fetch existing categories
  let categories: Array<{ _id: string; name: string }> = [];
  try {
    categories = await Category.find({ del_flag: 0 }).select("_id name").lean();
  } catch {
    // Proceed with empty list
  }

  if (categories.length === 0) {
    return {
      suggestedCategory: { id: "", name: "General", confidence: 0.5 },
    };
  }

  const categoryList = categories.map((c) => `- ${c.name} (id: ${c._id})`).join("\n");
  const truncatedContent = content.slice(0, 2000);

  const result = await aiExecutionFacade.execute<CategoryDetectionResult>({
    scope: "publishing",
    messages: [
      {
        role: "system" as const,
        content: `You are a content classifier. Select the single best matching category for a blog article from this list:
${categoryList}

Rules:
- Choose the category that best matches the article's primary topic.
- Return the exact category name and id from the list above.
- Include a confidence score (0.0 to 1.0) reflecting match certainty.
Respond ONLY with valid JSON: { "suggestedCategory": { "id": "...", "name": "...", "confidence": 0.85 } }`,
      },
      {
        role: "user" as const,
        content: `Title: ${title}\n\nArticle excerpt:\n${truncatedContent}`,
      },
    ],
    responseFormat: "json",
    defaultModel: "fast",
    schema: CategoryDetectionResultSchema,
    ...(signal !== undefined && { signal }),
  });

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || "Failed to detect category");
  }

  return result.data;
}

// ─── Task 4: Generate Slug (Deterministic, No AI) ───────────────────────────

export async function generateSlug(title: string): Promise<string> {
  let slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "")       // remove non-alphanumeric
    .replace(/\s+/g, "-")               // spaces to hyphens
    .replace(/-+/g, "-")                // deduplicate hyphens
    .replace(/^-|-$/g, "");             // trim leading/trailing hyphens

  if (!slug) slug = "untitled-post";

  // Ensure uniqueness against existing posts
  let candidate = slug;
  let suffix = 1;
  while (true) {
    const existing = await Post.findOne({ slug: candidate }).select("_id").lean();
    if (!existing) break;
    candidate = `${slug}-${suffix}`;
    suffix++;
    if (suffix > 100) break; // safety valve
  }

  return candidate;
}

// ─── Task 5: Calculate Read Time (Deterministic, No AI) ─────────────────────

export function calculateReadTime(content: string): number {
  const WPM = 238;
  const IMAGE_SECONDS = 12;
  const CODE_BLOCK_SECONDS = 15;

  const words = content.trim().split(/\s+/).filter(Boolean).length;

  // Count images (markdown and HTML)
  const mdImages = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
  const htmlImages = (content.match(/<img\s/gi) || []).length;
  const imageCount = mdImages + htmlImages;

  // Count code blocks
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;

  const readMinutes = words / WPM;
  const extraSeconds = (imageCount * IMAGE_SECONDS) + (codeBlocks * CODE_BLOCK_SECONDS);

  return Math.max(1, Math.ceil(readMinutes + (extraSeconds / 60)));
}

// ─── Task 6: Basic SEO Validation (Deterministic, No AI) ────────────────────

export function validateSEO(params: {
  title: string;
  description: string | null;
  slug: string | null;
  content: string;
}): SEOValidation {
  const issues: SEOIssue[] = [];
  let score = 100;

  // Title checks
  const titleLen = params.title.trim().length;
  if (titleLen < 5) {
    issues.push({ field: "title", severity: "error", message: `Title too short (${titleLen} chars). Aim for 30–60 characters.` });
    score -= 20;
  } else if (titleLen > 60) {
    issues.push({ field: "title", severity: "warning", message: `Title may be truncated in SERP (${titleLen} chars). Aim for ≤60.` });
    score -= 5;
  }

  // Description checks
  if (!params.description) {
    issues.push({ field: "description", severity: "error", message: "Meta description is missing." });
    score -= 20;
  } else {
    const descLen = params.description.trim().length;
    if (descLen < 120) {
      issues.push({ field: "description", severity: "warning", message: `Meta description is short (${descLen} chars). Aim for 120–155.` });
      score -= 5;
    } else if (descLen > 160) {
      issues.push({ field: "description", severity: "warning", message: `Meta description may be truncated (${descLen} chars). Aim for ≤160.` });
      score -= 5;
    }
  }

  // Slug checks
  if (!params.slug) {
    issues.push({ field: "slug", severity: "error", message: "URL slug is missing." });
    score -= 15;
  }

  // Content heading hierarchy
  if (params.content.includes("# ") && !params.content.startsWith("# ")) {
    const h1Count = (params.content.match(/^# /gm) || []).length;
    if (h1Count > 0) {
      issues.push({ field: "headings", severity: "warning", message: "H1 tag found inside content body (reserved for title)." });
      score -= 5;
    }
  }

  // Content length
  const wordCount = params.content.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 300) {
    issues.push({ field: "content", severity: "warning", message: `Content is thin (${wordCount} words). Aim for 300+ words.` });
    score -= 10;
  }

  // Unsecure links
  if (/\[.*?\]\(http:\/\//.test(params.content) || params.content.includes('href="http://')) {
    issues.push({ field: "links", severity: "warning", message: "Unsecure HTTP links detected. Use HTTPS." });
    score -= 5;
  }

  score = Math.max(0, score);

  return {
    score,
    issues,
    passed: issues.filter((i) => i.severity === "error").length === 0,
  };
}
