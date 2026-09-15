// =============================================================================
//  INTERNAL LINK AI AGENT
//  ai/agent/internalLink.agent.ts
//
//  Design Decisions:
//  - Automatically searches MongoDB for published posts.
//  - Contextually inserts internal links into article blocks.
//  - Enforces rules: Max 6 links, no duplicate slugs, preserves block structure.
// =============================================================================

import { BaseAgent } from "./base.agent";
import { InternalLinkSchema, type InternalLinkOutput } from "./internalLink.schema";
import type { AgentOptions, AgentResult } from "./types";
const { Post } = require("../../models");

export interface InternalLinkInput extends Record<string, any> {
  readonly blocks: any[];
  readonly currentPostId?: string;
}

export class InternalLinkAgent extends BaseAgent<InternalLinkInput, InternalLinkOutput> {
  readonly name = "InternalLinkAgent";
  protected readonly defaultModel = "fast";
  protected readonly promptName = "internal-link";
  protected readonly responseFormat = "json";
  protected override readonly schema = InternalLinkSchema;

  /**
   * Overrides execute to automatically query candidate published posts from MongoDB.
   */
  public override async execute(
    input: InternalLinkInput,
    options: AgentOptions = {}
  ): Promise<AgentResult<InternalLinkOutput>> {
    const { blocks, currentPostId } = input;

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return {
        success: true,
        data: {
          blocks: blocks || [],
          insertedLinksCount: 0,
          insertedSlugs: [],
        },
        executionTimeMs: 0,
      };
    }

    // 1. Search MongoDB for related published posts (excluding self)
    const query: Record<string, any> = { published: true };
    if (currentPostId) {
      query._id = { $ne: currentPostId };
    }

    const candidateDocs = await Post.find(query)
      .select("title slug description tags")
      .limit(30)
      .lean();

    const candidatePosts = (candidateDocs || []).map((doc: any) => ({
      title: doc.title,
      slug: doc.slug,
      description: doc.description || "",
      tags: doc.tags || [],
      url: `/post/${doc.slug}`,
    }));

    // If no candidate posts exist in DB, return original blocks cleanly
    if (candidatePosts.length === 0) {
      return {
        success: true,
        data: {
          blocks,
          insertedLinksCount: 0,
          insertedSlugs: [],
        },
        executionTimeMs: 0,
      };
    }

    // 2. Prepare JSON prompt parameters
    const enrichedInput: InternalLinkInput = {
      ...input,
      candidatePostsJson: JSON.stringify(candidatePosts, null, 2),
      blocksJson: JSON.stringify(blocks, null, 2),
    };

    // 3. Delegate execution to BaseAgent & LLM
    return super.execute(enrichedInput, options);
  }

  /**
   * Validates output constraints (max 6 links, preserves block structure).
   */
  protected override async validate(data: InternalLinkOutput): Promise<boolean> {
    if (!data || !Array.isArray(data.blocks)) {
      console.error("[InternalLinkAgent] Invalid output: blocks array missing.");
      return false;
    }

    if (data.insertedLinksCount > 6) {
      console.error(`[InternalLinkAgent] Exceeded maximum 6 links limit: got ${data.insertedLinksCount}.`);
      return false;
    }

    // Ensure no duplicate slugs were inserted
    if (Array.isArray(data.insertedSlugs)) {
      const uniqueSlugs = new Set(data.insertedSlugs);
      if (uniqueSlugs.size !== data.insertedSlugs.length) {
        console.error("[InternalLinkAgent] Duplicate target links detected in output.");
        return false;
      }
    }

    return true;
  }
}
