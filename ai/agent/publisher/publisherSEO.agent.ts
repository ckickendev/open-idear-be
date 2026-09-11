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
    if (!data.metaDescription || data.metaDescription.length > 160) {
      console.error("[PublisherSEOAgent] metaDescription missing or exceeds 160 characters.");
      return false;
    }
    if (!data.slug || !data.category || !Array.isArray(data.tags)) {
      console.error("[PublisherSEOAgent] Missing required SEO fields.");
      return false;
    }
    return true;
  }
}
