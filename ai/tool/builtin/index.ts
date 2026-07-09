import type { AITool, ToolContext } from "../types";
import { z } from "zod";
import slugify from "slugify";
import { aiExecutionFacade } from "../../execution";

// Load Mongoose models and Express service singletons safely
const { Post, Category } = require("../../../models");
const { postService, unifiedSearchService } = require("../../../services");

// =============================================================================
//  1. READ POST TOOL
// =============================================================================

export class ReadPostTool implements AITool<{ identifier: string; type: "id" | "slug" }, any> {
  readonly id = "builtin.read-post";
  readonly name = "ReadPost";
  readonly description = "Retrieve full post text, title, category, and metadata by ID or Slug.";
  readonly version = "1.0.0";
  readonly category = "posts";
  readonly tags = ["read", "posts"];
  readonly permissions = { allowedScopes: "*" as const, requiredRole: "public" as const };

  readonly inputSchema = z.object({
    identifier: z.string().describe("The Mongo ID or Slug of the post to load."),
    type: z.enum(["id", "slug"]).describe("Type of identifier being searched."),
  });

  readonly outputSchema = z.any();

  async execute(args: { identifier: string; type: "id" | "slug" }): Promise<any> {
    if (args.type === "id") {
      return await postService.getPostById(args.identifier);
    } else {
      return await postService.getPostBySlug(args.identifier);
    }
  }
}

// =============================================================================
//  2. SEARCH POST TOOL
// =============================================================================

export class SearchPostTool implements AITool<{ query: string; limit?: number }, any[]> {
  readonly id = "builtin.search-post";
  readonly name = "SearchPost";
  readonly description = "Search user posts database matching keywords or title query text.";
  readonly version = "1.0.0";
  readonly category = "posts";
  readonly tags = ["search", "posts"];
  readonly permissions = { allowedScopes: "*" as const, requiredRole: "public" as const };

  readonly inputSchema = z.object({
    query: z.string().describe("Search query string matching post title or content."),
    limit: z.number().optional().default(10).describe("Maximum results to return."),
  });

  readonly outputSchema = z.array(z.any());

  async execute(args: { query: string; limit?: number }): Promise<any[]> {
    const limit = args.limit || 10;
    return await Post.find({
      del_flag: 0,
      $or: [
        { title: { $regex: args.query, $options: "i" } },
        { content: { $regex: args.query, $options: "i" } },
      ],
    })
      .populate("category", "name")
      .limit(limit)
      .lean();
  }
}

// =============================================================================
//  3. SEARCH MEDIA TOOL
// =============================================================================

export class SearchMediaTool implements AITool<{ query: string; page?: number; limit?: number }, any[]> {
  readonly id = "builtin.search-media";
  readonly name = "SearchMedia";
  readonly description = "Perform unified search across local library and stock media providers (Unsplash/Pexels).";
  readonly version = "1.0.0";
  readonly category = "media";
  readonly tags = ["search", "media", "stock"];
  readonly permissions = { allowedScopes: "*" as const, requiredRole: "authenticated" as const };

  readonly inputSchema = z.object({
    query: z.string().describe("Search term query (e.g. 'green recycling bin')."),
    page: z.number().optional().default(1).describe("Page number for paginated results."),
    limit: z.number().optional().default(20).describe("Number of search results per page."),
  });

  readonly outputSchema = z.array(z.any());

  async execute(args: { query: string; page?: number; limit?: number }, context: ToolContext): Promise<any[]> {
    const userId = context.user?.id || "";
    return await unifiedSearchService.search(userId, args.query, args.page, args.limit);
  }
}

// =============================================================================
//  4. SUGGEST TAGS TOOL
// =============================================================================

export class SuggestTagsTool implements AITool<{ title: string; content: string }, string[]> {
  readonly id = "builtin.suggest-tags";
  readonly name = "SuggestTags";
  readonly description = "Suggest relevant SEO tag keywords based on the article title and draft content.";
  readonly version = "1.0.0";
  readonly category = "content";
  readonly tags = ["tags", "metadata", "content"];
  readonly permissions = { allowedScopes: "*" as const, requiredRole: "authenticated" as const };

  readonly inputSchema = z.object({
    title: z.string().describe("Title of the post article."),
    content: z.string().describe("Draft text content of the article."),
  });

  readonly outputSchema = z.array(z.string());

  async execute(args: { title: string; content: string }): Promise<string[]> {
    const userPrompt =
      `Generate a JSON string array of 4-7 relevant, short, SEO-friendly tags ` +
      `based on this article details:\nTitle: "${args.title}"\nContent: "${args.content.slice(0, 3000)}"`;

    const facadeResult = await aiExecutionFacade.execute<string[]>({
      scope: "editor",
      responseFormat: "json",
      defaultModel: "fast",
      schema: z.array(z.string()),
      messages: [
        { role: "system", content: "You are an SEO meta tag generator. Return ONLY a raw JSON string array." },
        { role: "user", content: userPrompt },
      ],
    });

    if (!facadeResult.success) {
      throw facadeResult.error || new Error("Failed to suggest tags.");
    }

    return facadeResult.data;
  }
}

// =============================================================================
//  5. GENERATE SLUG TOOL
// =============================================================================

export class GenerateSlugTool implements AITool<{ title: string }, string> {
  readonly id = "builtin.generate-slug";
  readonly name = "GenerateSlug";
  readonly description = "Convert post titles into URL-safe clean lowercase string slugs.";
  readonly version = "1.0.0";
  readonly category = "content";
  readonly tags = ["slug", "url", "formatting"];
  readonly permissions = { allowedScopes: "*" as const, requiredRole: "public" as const };

  readonly inputSchema = z.object({
    title: z.string().describe("Article title text (e.g. 'My 10 Tips for Recycling!')."),
  });

  readonly outputSchema = z.string();

  async execute(args: { title: string }): Promise<string> {
    return slugify(args.title, {
      lower: true,
      strict: true,
      trim: true,
    });
  }
}

// =============================================================================
//  6. SEARCH CATEGORY TOOL
// =============================================================================

export class SearchCategoryTool implements AITool<{ nameQuery: string }, any[]> {
  readonly id = "builtin.search-category";
  readonly name = "SearchCategory";
  readonly description = "Lookup matching categories name filters inside the database.";
  readonly version = "1.0.0";
  readonly category = "categories";
  readonly tags = ["search", "categories"];
  readonly permissions = { allowedScopes: "*" as const, requiredRole: "public" as const };

  readonly inputSchema = z.object({
    nameQuery: z.string().describe("Keyword search matching category name."),
  });

  readonly outputSchema = z.array(z.any());

  async execute(args: { nameQuery: string }): Promise<any[]> {
    return await Category.find({
      name: { $regex: args.nameQuery, $options: "i" },
      del_flag: { $ne: 1 },
    }).lean();
  }
}
