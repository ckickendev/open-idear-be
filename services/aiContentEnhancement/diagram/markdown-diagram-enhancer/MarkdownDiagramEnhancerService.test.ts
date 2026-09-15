/**
 * MarkdownDiagramEnhancerService.test.ts
 * Unit tests for Markdown Diagram Enhancer.
 */

import { MarkdownDiagramEnhancerService } from "./MarkdownDiagramEnhancerService";
import { MermaidDiagram } from "../schemas/diagram.schema";

describe("MarkdownDiagramEnhancerService", () => {
  let enhancer: MarkdownDiagramEnhancerService;

  beforeEach(() => {
    enhancer = new MarkdownDiagramEnhancerService();
  });

  test("should insert diagram after matching heading", () => {
    const originalMarkdown = `
# System Architecture

## Database Schema
This section describes the database relationships.

## Conclusion
Final notes.
    `.trim();

    const diagrams: MermaidDiagram[] = [
      {
        heading: "Database Schema",
        code: "erDiagram\n    USER ||--o{ POST : writes",
        diagramType: "er",
        purpose: "Visualize user and post relationships",
        priority: 1,
      },
    ];

    const result = enhancer.enhance(originalMarkdown, diagrams);

    expect(result.insertedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.insertedHeadings).toContain("Database Schema");
    expect(result.markdown).toContain("```mermaid\nerDiagram");
    expect(result.markdown).toContain("## Database Schema");
  });

  test("should avoid duplicate diagram insertion if already present", () => {
    const markdownWithDiagram = `
## Database Schema

```mermaid
erDiagram
    USER ||--o{ POST : writes
```

This section describes database.
    `.trim();

    const diagrams: MermaidDiagram[] = [
      {
        heading: "Database Schema",
        code: "erDiagram\n    USER ||--o{ POST : writes",
        diagramType: "er",
        purpose: "Duplicate check",
        priority: 1,
      },
    ];

    const result = enhancer.enhance(markdownWithDiagram, diagrams);

    expect(result.insertedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });
});
