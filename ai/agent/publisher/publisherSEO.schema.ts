import { z } from "zod";

/**
 * Truncates a string to at most `max` characters, breaking at the last
 * word boundary (space) to avoid cutting mid-word.
 */
function truncateAtWordBoundary(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // If no space found, hard-cut at max (very rare for natural prose)
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

export const PublisherSEOSchema = z.object({
  // Auto-truncate to <=160 chars rather than hard-failing the entire publish.
  // The LLM prompt already instructs 160-char maximum; this is a safety net.
  metaDescription: z
    .string()
    .transform((val) => truncateAtWordBoundary(val, 160)),
  slug: z.string(),
  tags: z.array(z.string()),
  category: z.string(),
});

export type PublisherSEOOutput = z.infer<typeof PublisherSEOSchema>;
