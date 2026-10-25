import { BaseAgent } from "../base.agent";
import { PublisherSEOSchema, type PublisherSEOOutput } from "./publisherSEO.schema";

export interface PublisherSEOInput extends Record<string, any> {
  readonly title: string;
  readonly keywords: string[];
}

export class PublisherSEOAgent extends BaseAgent<PublisherSEOInput, PublisherSEOOutput> {
  readonly name = "PublisherSEOAgent";
  protected readonly defaultModel = "fast";
  protected readonly promptName = "publisher-seo";
  protected readonly responseFormat = "json";
  protected override readonly schema = PublisherSEOSchema;

  protected override async validate(data: PublisherSEOOutput): Promise<boolean> {
    // metaDescription is auto-truncated to <=160 chars by the schema transform.
    // This guard is a final safety assertion after transformation.
    if (!data.metaDescription) {
      console.error("[PublisherSEOAgent] metaDescription is missing.");
      return false;
    }
    if (data.metaDescription.length > 160) {
      // Should never reach here due to schema transform, but log if it does.
      console.error(
        `[PublisherSEOAgent] metaDescription still exceeds 160 chars after transform (${data.metaDescription.length} chars).`
      );
      return false;
    }
    if (!data.slug || !data.category || !Array.isArray(data.tags)) {
      console.error("[PublisherSEOAgent] Missing required SEO fields.");
      return false;
    }
    return true;
  }
}

