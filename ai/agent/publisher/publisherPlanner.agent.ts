import { BaseAgent } from "../base.agent";
import { PublisherPlannerSchema, type PublisherPlan } from "./publisherPlanner.schema";

export interface PublisherPlannerInput extends Record<string, any> {
  readonly topic: string;
  readonly audience: string;
}

export class PublisherPlannerAgent extends BaseAgent<PublisherPlannerInput, PublisherPlan> {
  readonly name = "PublisherPlannerAgent";
  protected readonly defaultModel = "fast";
  protected readonly promptName = "publisher-planner";
  protected readonly responseFormat = "json";
  protected override readonly schema = PublisherPlannerSchema;

  protected override async validate(data: PublisherPlan): Promise<boolean> {
    if (!data || !Array.isArray(data.outline) || data.outline.length < 2) {
      console.error("[PublisherPlannerAgent] Outline must have at least 2 sections.");
      return false;
    }
    if (!data.title || !data.keywords || !data.searchIntent) {
      console.error("[PublisherPlannerAgent] Missing required plan fields.");
      return false;
    }
    return true;
  }
}
