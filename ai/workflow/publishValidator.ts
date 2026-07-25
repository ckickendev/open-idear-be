// =============================================================================
//  AI WORKFLOW — PUBLISH VALIDATION ENGINE
//  ai/workflow/publishValidator.ts
//
//  Design Decisions:
//  - Encapsulates clean validation logic for pre-publish safety checks.
//  - Validates: Title Length, Slug, Duplicate Slug, Category, Cover Image,
//    Images Alt text, Description, Broken Links, and Duplicate Headings.
//  - Fully reusable, standalone engine separate from presentation components.
//  - Operates locally without invoking LLM AI Peer Review services.
// =============================================================================

export interface ValidationIssue {
  readonly code: string;
  readonly field: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface ValidationOptions {
  readonly checkDuplicateSlug?: (slug: string, excludePostId?: string) => Promise<boolean>;
}

export class PublishValidator {
  /**
   * Scans content body for duplicate heading text (e.g. duplicate H2 / H3 blocks).
   */
  private checkDuplicateHeadings(text: string): string[] {
    const headings = text.match(/^#{1,6}\s+(.+)$/gm) || [];
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const rawHeading of headings) {
      const cleanHeading = rawHeading.replace(/^#{1,6}\s+/, "").trim().toLowerCase();
      if (seen.has(cleanHeading)) {
        duplicates.push(rawHeading.replace(/^#{1,6}\s+/, "").trim());
      } else {
        seen.add(cleanHeading);
      }
    }
    return duplicates;
  }

  /**
   * Validates a post payload against 9 editorial validation checks.
   */
  async validate(
    postId: string,
    post: any,
    options: ValidationOptions = {}
  ): Promise<{ isValid: boolean; issues: ValidationIssue[] }> {
    const issues: ValidationIssue[] = [];

    // 1. Title Length Check
    const title = (post.title || "").trim();
    if (!title) {
      issues.push({
        code: "TITLE_MISSING",
        field: "title",
        message: "Title is completely missing.",
        severity: "error",
      });
    } else if (title.length < 5 || title.length > 80) {
      issues.push({
        code: "TITLE_LENGTH",
        field: "title",
        message: `Title length (${title.length}) is outside the optimal 5-80 range.`,
        severity: "warning",
      });
    }

    // 2. SEO Meta Description Check
    const desc = (post.description || "").trim();
    if (!desc) {
      issues.push({
        code: "DESCRIPTION_MISSING",
        field: "description",
        message: "SEO Meta Description is missing.",
        severity: "warning",
      });
    } else if (desc.length < 20 || desc.length > 160) {
      issues.push({
        code: "DESCRIPTION_LENGTH",
        field: "description",
        message: `Description length (${desc.length}) is outside the optimal 20-160 range.`,
        severity: "warning",
      });
    }

    // 3. Category Check
    if (!post.category) {
      issues.push({
        code: "CATEGORY_MISSING",
        field: "category",
        message: "Category is not selected.",
        severity: "error",
      });
    }

    // 4. Slug Format Check
    const slug = (post.slug || "").trim();
    if (!slug) {
      issues.push({
        code: "SLUG_MISSING",
        field: "slug",
        message: "SEO URL slug is missing.",
        severity: "error",
      });
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      issues.push({
        code: "SLUG_FORMAT",
        field: "slug",
        message: "Slug format is invalid. Use lowercase letters, numbers, and hyphens.",
        severity: "error",
      });
    }

    // 5. Duplicate Slug Database check
    if (slug && options.checkDuplicateSlug) {
      const isDuplicate = await options.checkDuplicateSlug(slug, postId);
      if (isDuplicate) {
        issues.push({
          code: "SLUG_DUPLICATE",
          field: "slug",
          message: "URL slug is already in use by another article.",
          severity: "error",
        });
      }
    }

    // 6. Cover Image Check
    if (!post.coverImage && !post.image) {
      issues.push({
        code: "COVER_IMAGE_MISSING",
        field: "coverImage",
        message: "Cover banner image is missing.",
        severity: "warning",
      });
    }

    // 7. Heading Duplications
    const content = post.content || "";
    const duplicateHeadings = this.checkDuplicateHeadings(content);
    for (const dup of duplicateHeadings) {
      issues.push({
        code: "HEADING_DUPLICATE",
        field: "content",
        message: `Duplicate heading found inside text: "${dup}".`,
        severity: "warning",
      });
    }

    // 8. Images Alt Attribute Check
    const mdImageRegex = /!\[(.*?)\]\((.*?)\)/g;
    let mdMatch;
    let missingAlts = 0;
    while ((mdMatch = mdImageRegex.exec(content)) !== null) {
      if (!mdMatch[1] || mdMatch[1].trim() === "") {
        missingAlts++;
      }
    }
    if (missingAlts > 0) {
      issues.push({
        code: "IMAGES_ALT_MISSING",
        field: "content",
        message: `Found ${missingAlts} image(s) lacking descriptive Alt text.`,
        severity: "warning",
      });
    }

    // 9. Broken Links Verification Check
    const linkRegex = /\[.*?\]\((.*?)\)/g;
    let linkMatch;
    let brokenLinks = 0;
    while ((linkMatch = linkRegex.exec(content)) !== null) {
      const href = linkMatch[1] || "";
      if (!href || href.startsWith("http://") || href.includes("placeholder") || href.includes("example.com")) {
        brokenLinks++;
      }
    }
    if (brokenLinks > 0) {
      issues.push({
        code: "LINKS_BROKEN_OR_UNSECURE",
        field: "content",
        message: `Found ${brokenLinks} broken or unsecure (HTTP) link references.`,
        severity: "warning",
      });
    }

    const isValid = !issues.some((issue) => issue.severity === "error");

    return { isValid, issues };
  }
}

export const publishValidator = new PublishValidator();
