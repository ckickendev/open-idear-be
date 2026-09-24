// =============================================================================
//  IMAGE GENERATOR STUBS (OPENAI & IDEOGRAM)
//  ai/image/providers/stubs.generator.ts
// =============================================================================

import type {
  ImageGenerator,
  GenerateIllustrationRequest,
  GeneratedIllustrationResult,
} from "../imageGenerator.interface";

export class OpenAIImageGenerator implements ImageGenerator {
  readonly id = "openai-dalle3";
  readonly displayName = "OpenAI DALL·E 3 (Future)";

  get isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY?.trim();
  }

  async generate(
    request: GenerateIllustrationRequest
  ): Promise<GeneratedIllustrationResult> {
    throw new Error(
      `OpenAI image generation provider (${this.id}) is not active in this environment.`
    );
  }
}

export class IdeogramImageGenerator implements ImageGenerator {
  readonly id = "ideogram";
  readonly displayName = "Ideogram v2 (Future)";

  get isAvailable(): boolean {
    return !!process.env.IDEOGRAM_API_KEY?.trim();
  }

  async generate(
    request: GenerateIllustrationRequest
  ): Promise<GeneratedIllustrationResult> {
    throw new Error(
      `Ideogram image generation provider (${this.id}) is not active in this environment.`
    );
  }
}
