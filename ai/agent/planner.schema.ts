import { z } from "zod";

export const PlannerSchema = z.object({
  title: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedReadingTime: z.number(), // in minutes
  keywords: z.array(z.string()),
  outline: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      level: z.number(), // heading level, e.g., 2 for H2, 3 for H3
    })
  ),
});

export type PlannerOutline = z.infer<typeof PlannerSchema>;
