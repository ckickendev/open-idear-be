import { z } from "zod";

export const PublisherPlannerSchema = z.object({
  title: z.string(),
  keywords: z.array(z.string()),
  searchIntent: z.enum(["informational", "navigational", "transactional"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedReadingTime: z.number(),
  outline: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      level: z.union([z.literal(2), z.literal(3)]),
    })
  ),
});

export type PublisherPlan = z.infer<typeof PublisherPlannerSchema>;
