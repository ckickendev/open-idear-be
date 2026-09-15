import { z } from "zod";

export const PublisherImageSchema = z.object({
  prompt: z.string(),
  altText: z.string(),
});

export type PublisherImagePromptOutput = z.infer<typeof PublisherImageSchema>;
