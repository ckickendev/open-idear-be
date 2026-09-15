import {
  PublisherPlannerAgent,
  PublisherWriterAgent,
  PublisherSEOAgent,
  PublisherValidatorAgent,
  type PublisherPlan,
  type PublisherWriterOutput,
  type PublisherSEOOutput,
  type ValidationResult,
} from "../agent/publisher";
import { PublisherCoverImageService, type CoverImageResult } from "./publisherCoverImage.service";

export type PublisherState =
  | "IDLE"
  | "PLANNING"
  | "WRITING"
  | "SEO"
  | "COVER_IMAGE"
  | "VALIDATING"
  | "DONE"
  | "FAILED";

export interface PublisherInput {
  topic: string;
  audience?: string;
  additionalInstructions?: string;
  userId?: string;
}

export interface PublisherRunContext {
  state: PublisherState;
  input: PublisherInput;
  plan?: PublisherPlan;
  writerOutput?: PublisherWriterOutput;
  seo?: PublisherSEOOutput;
  coverImage?: CoverImageResult;
  validation?: ValidationResult;
  error?: {
    state: PublisherState;
    message: string;
  };
  updatedAt: string;
}

export class PublisherOrchestrator {
  private readonly plannerAgent: PublisherPlannerAgent;
  private readonly writerAgent: PublisherWriterAgent;
  private readonly seoAgent: PublisherSEOAgent;
  private readonly validatorAgent: PublisherValidatorAgent;
  private readonly coverImageService: PublisherCoverImageService;

  constructor(
    plannerAgent?: PublisherPlannerAgent,
    writerAgent?: PublisherWriterAgent,
    seoAgent?: PublisherSEOAgent,
    validatorAgent?: PublisherValidatorAgent,
    coverImageService?: PublisherCoverImageService
  ) {
    this.plannerAgent = plannerAgent ?? new PublisherPlannerAgent();
    this.writerAgent = writerAgent ?? new PublisherWriterAgent();
    this.seoAgent = seoAgent ?? new PublisherSEOAgent();
    this.validatorAgent = validatorAgent ?? new PublisherValidatorAgent();
    this.coverImageService = coverImageService ?? new PublisherCoverImageService();
  }

  /**
   * Initializes a clean run context.
   */
  public createContext(input: PublisherInput): PublisherRunContext {
    return {
      state: "IDLE",
      input: {
        topic: input.topic.trim(),
        audience: input.audience || "developers",
        additionalInstructions: input.additionalInstructions || "",
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Execute full pipeline from current state (resumable).
   */
  public async execute(
    inputOrContext: PublisherInput | PublisherRunContext,
    signal?: AbortSignal
  ): Promise<PublisherRunContext> {
    let ctx: PublisherRunContext =
      "state" in inputOrContext
        ? (inputOrContext as PublisherRunContext)
        : this.createContext(inputOrContext as PublisherInput);

    const options = signal ? { signal } : {};

    try {
      // 1. PLANNING
      if (ctx.state === "IDLE" || ctx.state === "PLANNING") {
        ctx.state = "PLANNING";
        ctx.updatedAt = new Date().toISOString();

        const planResult = await this.plannerAgent.execute(
          {
            topic: ctx.input.topic,
            audience: ctx.input.audience || "developers",
          },
          options
        );

        if (!planResult.success || !planResult.data) {
          throw new Error("Planning stage failed.");
        }

        ctx.plan = planResult.data;
        ctx.state = "WRITING";
      }

      // 2. WRITING
      if (ctx.state === "WRITING") {
        ctx.updatedAt = new Date().toISOString();
        if (!ctx.plan) throw new Error("Cannot execute WRITING state without a Plan.");

        const writerResult = await this.writerAgent.execute(
          {
            plan: ctx.plan,
            additionalInstructions: ctx.input.additionalInstructions,
          },
          options
        );

        if (!writerResult.success || !writerResult.data) {
          throw new Error("Writing stage failed.");
        }

        ctx.writerOutput = writerResult.data;
        ctx.state = "SEO";
      }

      // 3. SEO
      if (ctx.state === "SEO") {
        ctx.updatedAt = new Date().toISOString();
        if (!ctx.plan) throw new Error("Cannot execute SEO state without a Plan.");

        const seoResult = await this.seoAgent.execute(
          {
            title: ctx.plan.title,
            keywords: ctx.plan.keywords,
          },
          options
        );

        if (!seoResult.success || !seoResult.data) {
          throw new Error("SEO stage failed.");
        }

        ctx.seo = seoResult.data;
        ctx.state = "COVER_IMAGE";
      }

      // 4. COVER_IMAGE
      if (ctx.state === "COVER_IMAGE") {
        ctx.updatedAt = new Date().toISOString();
        if (!ctx.plan) throw new Error("Cannot execute COVER_IMAGE state without a Plan.");

        const coverResult = await this.coverImageService.generateAndSaveCoverImage(
          {
            title: ctx.plan.title,
            keywords: ctx.plan.keywords,
            userId: ctx.input.userId,
          },
          signal
        );

        ctx.coverImage = coverResult;
        ctx.state = "VALIDATING";
      }

      // 5. VALIDATING
      if (ctx.state === "VALIDATING") {
        ctx.updatedAt = new Date().toISOString();
        if (!ctx.writerOutput || !ctx.seo || !ctx.plan) {
          throw new Error("Cannot execute VALIDATING state without writer and SEO outputs.");
        }

        const validation = this.validatorAgent.validate({
          blocks: ctx.writerOutput.blocks,
          seo: ctx.seo,
          wordCount: ctx.writerOutput.wordCount,
          title: ctx.plan.title,
        });

        ctx.validation = validation;
        ctx.state = "DONE";
        ctx.updatedAt = new Date().toISOString();
      }

      return ctx;
    } catch (err: any) {
      ctx.error = {
        state: ctx.state,
        message: err.message || "Pipeline execution error",
      };
      ctx.state = "FAILED";
      ctx.updatedAt = new Date().toISOString();
      return ctx;
    }
  }

  /**
   * Resumes execution from a saved run context.
   */
  public async resume(context: PublisherRunContext, signal?: AbortSignal): Promise<PublisherRunContext> {
    if (context.state === "FAILED" && context.error) {
      // Revert to failed state to attempt retry
      context.state = context.error.state;
      context.error = undefined;
    }
    return this.execute(context, signal);
  }
}
