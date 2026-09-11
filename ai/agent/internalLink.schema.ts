import { z } from "zod";

export const InternalLinkSchema = z.object({
  blocks: z.array(z.record(z.any())),
  insertedLinksCount: z.number().max(6),
  insertedSlugs: z.array(z.string()),
});

export type InternalLinkOutput = z.infer<typeof InternalLinkSchema>;
