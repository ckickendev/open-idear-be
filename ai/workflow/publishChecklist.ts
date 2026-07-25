// =============================================================================
//  AI WORKFLOW — REDESIGNED PUBLISH CHECKLIST ENGINE
//  ai/workflow/publishChecklist.ts
//
//  Design Decisions:
//  - Implements local validation checks for all 12 editorial checkpoints.
//  - Checks: Title, Description, Category, Slug, Tags, Cover Image, Headings,
//    Images Alt, Broken Images, Code Blocks, Links, and Read Time.
//  - Runs locally inside the editor/backend pipeline without duplicating LLM reviews.
//  - Exposes Status, Severity, Fix Actions, and Auto-Fix handlers.
// =============================================================================

export interface ChecklistItemResult {
  readonly id: string;
  readonly name: string;
  readonly status: "passed" | "warning" | "failed";
  readonly severity: "info" | "warning" | "error";
  readonly message?: string;
  readonly fixActionDescription?: string;
  readonly hasAutoFix: boolean;
}

export interface PublishChecklistRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: "info" | "warning" | "error";

  validate(post: any): Promise<Omit<ChecklistItemResult, "id" | "name" | "severity">>;
  autoFix?(post: any): Promise<any>; // Returns updated post object
}

export class PublishChecklistRegistry {
  private readonly rules = new Map<string, PublishChecklistRule>();

  register(rule: PublishChecklistRule): this {
    this.rules.set(rule.id, rule);
    return this;
  }

  get(id: string): PublishChecklistRule {
    const rule = this.rules.get(id);
    if (!rule) throw new Error(`[PublishChecklist] Rule "${id}" is not registered.`);
    return rule;
  }

  list(): PublishChecklistRule[] {
    return Array.from(this.rules.values());
  }

  async runAll(post: any): Promise<{ isReady: boolean; items: ChecklistItemResult[] }> {
    const items: ChecklistItemResult[] = [];
    let isReady = true;

    for (const rule of this.rules.values()) {
      try {
        const validation = await rule.validate(post);
        items.push({
          id: rule.id,
          name: rule.name,
          severity: rule.severity,
          ...validation,
        });

        if (validation.status === "failed" && rule.severity === "error") {
          isReady = false;
        }
      } catch (err: any) {
        items.push({
          id: rule.id,
          name: rule.name,
          status: "failed",
          severity: rule.severity,
          message: err.message || "Validation error.",
          fixActionDescription: "Contact support.",
          hasAutoFix: false,
        });
        if (rule.severity === "error") isReady = false;
      }
    }

    return { isReady, items };
  }
}

export const publishChecklistRegistry = new PublishChecklistRegistry();

// ─── Default 12 Rules Registrations ──────────────────────────────────────────

// 1. Title Audit
publishChecklistRegistry.register({
  id: "title",
  name: "Post Title Check",
  description: "Validates title presence and length boundaries.",
  severity: "error",
  async validate(post) {
    const title = (post.title || "").trim();
    if (!title) {
      return {
        status: "failed",
        message: "Post Title is completely missing.",
        fixActionDescription: "Type in a title tag at the top of the editor canvas.",
        hasAutoFix: false,
      };
    }
    if (title.length < 5 || title.length > 60) {
      return {
        status: "warning",
        message: `Title length (${title.length} characters) is outside optimal 5-60 bounds.`,
        fixActionDescription: "Modify the title length in the header input.",
        hasAutoFix: false,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
});

// 2. Description Audit (with Auto-Fix)
publishChecklistRegistry.register({
  id: "description",
  name: "Meta Description Check",
  description: "Validates meta description SEO parameters.",
  severity: "warning",
  async validate(post) {
    const desc = (post.description || "").trim();
    if (!desc) {
      return {
        status: "failed",
        message: "Meta Description is missing.",
        fixActionDescription: "Provide a meta description snippet under the SEO tab or apply Auto-Fix.",
        hasAutoFix: true,
      };
    }
    if (desc.length < 20 || desc.length > 160) {
      return {
        status: "warning",
        message: `Description length (${desc.length} characters) is outside optimal 20-160 range.`,
        fixActionDescription: "Edit the meta description length inside publish settings.",
        hasAutoFix: false,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
  async autoFix(post) {
    const content = post.content || "";
    const cleanSnippet = content
      .replace(/[#*`!\[\]\(\)]/g, "")
      .trim()
      .slice(0, 150);
    return { ...post, description: `${cleanSnippet}...` };
  },
});

// 3. Category Audit
publishChecklistRegistry.register({
  id: "category",
  name: "Category Check",
  description: "Validates that a publication category is selected.",
  severity: "error",
  async validate(post) {
    if (!post.category) {
      return {
        status: "failed",
        message: "Category is not selected.",
        fixActionDescription: "Select a primary category classification under metadata settings.",
        hasAutoFix: false,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
});

// 4. Slug Audit (with Auto-Fix)
publishChecklistRegistry.register({
  id: "slug",
  name: "URL Slug Check",
  description: "Validates alphanumeric hyphenated formats for URLs.",
  severity: "error",
  async validate(post) {
    const slug = (post.slug || "").trim();
    if (!slug) {
      return {
        status: "failed",
        message: "SEO URL slug is missing.",
        fixActionDescription: "Input a slug or apply Auto-Fix to generate one from the title.",
        hasAutoFix: true,
      };
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return {
        status: "failed",
        message: "Slug contains invalid characters or capitals.",
        fixActionDescription: "Use only lowercase letters, numbers, and hyphens.",
        hasAutoFix: true,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
  async autoFix(post) {
    const title = (post.title || "post").toLowerCase();
    const sanitized = title
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return { ...post, slug: sanitized || "untitled-draft" };
  },
});

// 5. Tags Audit
publishChecklistRegistry.register({
  id: "tags",
  name: "Tags Check",
  description: "Validates article tagging parameters.",
  severity: "warning",
  async validate(post) {
    if (!Array.isArray(post.tags) || post.tags.length === 0) {
      return {
        status: "failed",
        message: "No tags are assigned to this draft.",
        fixActionDescription: "Add keyword tags under metadata settings to group your post.",
        hasAutoFix: false,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
});

// 6. Cover Image Audit
publishChecklistRegistry.register({
  id: "cover-image",
  name: "Cover Image Check",
  description: "Validates cover banner parameters.",
  severity: "warning",
  async validate(post) {
    if (!post.coverImage && !post.image) {
      return {
        status: "failed",
        message: "No cover banner image is specified.",
        fixActionDescription: "Upload a featured banner image under the media tab.",
        hasAutoFix: false,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
});

// 7. Headings Outline Audit
publishChecklistRegistry.register({
  id: "headings",
  name: "Headings Order Check",
  description: "Validates header hierarchies inside content.",
  severity: "warning",
  async validate(post) {
    const content = post.content || "";
    if (content.includes("# ") || content.includes("<h1>")) {
      return {
        status: "failed",
        message: "H1 heading tag is used inside content body.",
        fixActionDescription: "Replace body H1s with H2 (##) tags; H1 is reserved for the post title.",
        hasAutoFix: false,
      };
    }
    const h2Index = content.indexOf("## ");
    const h3Index = content.indexOf("### ");
    if (h3Index !== -1 && (h2Index === -1 || h3Index < h2Index)) {
      return {
        status: "failed",
        message: "Heading order mismatch: H3 used before an H2 block.",
        fixActionDescription: "Ensure sub-headings are nested correctly inside parent headers.",
        hasAutoFix: false,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
});

// 8. Images Alt Audit
publishChecklistRegistry.register({
  id: "images-alt",
  name: "Image ALT Tags Check",
  description: "Ensures all body image media has description alt strings.",
  severity: "warning",
  async validate(post) {
    const content = post.content || "";
    const mdImageRegex = /!\[(.*?)\]\((.*?)\)/g;
    let mdMatch;
    while ((mdMatch = mdImageRegex.exec(content)) !== null) {
      if (!mdMatch[1] || mdMatch[1].trim() === "") {
        return {
          status: "failed",
          message: "One or more body images are missing ALT description text.",
          fixActionDescription: "Add image descriptive labels inside markdown ![altText](url) tags.",
          hasAutoFix: false,
        };
      }
    }
    return { status: "passed", hasAutoFix: false };
  },
});

// 9. Broken Images Audit
publishChecklistRegistry.register({
  id: "broken-images",
  name: "Broken Images Check",
  description: "Scans image elements for invalid or placeholder source links.",
  severity: "error",
  async validate(post) {
    const content = post.content || "";
    const mdImageRegex = /!\[(.*?)\]\((.*?)\)/g;
    let mdMatch;
    while ((mdMatch = mdImageRegex.exec(content)) !== null) {
      const src = mdMatch[2] || "";
      if (!src || src.includes("placeholder") || src.includes("example.com")) {
        return {
          status: "failed",
          message: "Draft contains broken or placeholder image reference links.",
          fixActionDescription: "Replace placeholder links with active CDN image URLs.",
          hasAutoFix: false,
        };
      }
    }
    return { status: "passed", hasAutoFix: false };
  },
});

// 10. Empty Code Blocks Audit
publishChecklistRegistry.register({
  id: "code-blocks",
  name: "Empty Code Blocks Check",
  description: "Ensures editor code fences are populated.",
  severity: "warning",
  async validate(post) {
    const content = post.content || "";
    const emptyCodeRegex = /```[a-z]*\s*```/g;
    if (emptyCodeRegex.test(content)) {
      return {
        status: "failed",
        message: "Found empty code fences inside the document.",
        fixActionDescription: "Insert code snippet values inside blocks or remove them entirely.",
        hasAutoFix: false,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
});

// 11. Links Safety Audit (with Auto-Fix)
publishChecklistRegistry.register({
  id: "links",
  name: "Secure Links Check",
  description: "Enforces secure connection protocols on external links.",
  severity: "warning",
  async validate(post) {
    const content = post.content || "";
    const hasUnsecure = /href=["']http:\/\/|\[.*?\]\(http:\/\//.test(content);
    if (hasUnsecure) {
      return {
        status: "failed",
        message: "Found insecure external URLs (http:// instead of https://).",
        fixActionDescription: "Upgrade link destinations to HTTPS manually or trigger Auto-Fix.",
        hasAutoFix: true,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
  async autoFix(post) {
    let content = post.content || "";
    content = content.replace(/(\[.*?\]\()http:\/\/([^)]+\))/g, "$1https://$2");
    content = content.replace(/href=["']http:\/\/([^"']+)["']/g, 'href="https://$1"');
    return { ...post, content };
  },
});

// 12. Estimated Read Time Audit
publishChecklistRegistry.register({
  id: "read-time",
  name: "Estimated Read Time Check",
  description: "Checks that document contains readable content.",
  severity: "info",
  async validate(post) {
    const content = post.content || "";
    const words = content.trim().split(/\s+/).filter((w: string) => w.length > 0).length;
    if (words === 0) {
      return {
        status: "failed",
        message: "No content is written in this draft.",
        fixActionDescription: "Write body text to enable read time predictions.",
        hasAutoFix: false,
      };
    }
    return { status: "passed", hasAutoFix: false };
  },
});
