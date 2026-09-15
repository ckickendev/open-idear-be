import { BaseAgent } from "../base.agent";
import { PublisherImageSchema, type PublisherImagePromptOutput } from "./publisherImage.schema";

export interface PublisherImageInput extends Record<string, any> {
  readonly title: string;
  readonly keywords?: string[];
}

export class PublisherImageAgent extends BaseAgent<PublisherImageInput, PublisherImagePromptOutput> {
  readonly name = "PublisherImageAgent";
  protected readonly defaultModel = "fast";
  protected readonly promptName = "publisher-image";
  protected readonly responseFormat = "json";
  protected override readonly schema = PublisherImageSchema;

  protected override async validate(data: PublisherImagePromptOutput): Promise<boolean> {
    if (!data.prompt || data.prompt.length < 10) {
      console.error("[PublisherImageAgent] Generated prompt is missing or too short.");
      return false;
    }
    return true;
  }
}
