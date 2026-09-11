import { z } from "zod";

export const PublisherSEOSchema = z.object({
  metaDescription: z.string().max(160),
  slug: z.string(),
  tags: z.array(z.string()),
  category: z.string(),
});

export type PublisherSEOOutput = z.infer<typeof PublisherSEOSchema>;
