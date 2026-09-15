/**
 * AIMermaidValidatorService.test.ts
 * Unit tests for Mermaid Validator.
 */

import { AIMermaidValidatorService } from "./AIMermaidValidatorService";

describe("AIMermaidValidatorService", () => {
  let validator: AIMermaidValidatorService;

  beforeEach(() => {
    validator = new AIMermaidValidatorService();
  });

  test("should validate valid flowchart TD diagram", () => {
    const code = `
```mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[Auth Service]
```
    `.trim();

    const result = validator.validate(code);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.sanitizedCode).toContain("graph TD");
  });

  test("should reject unsupported diagram keyword", () => {
    const code = `
```mermaid
invalidDirective TD
    A --> B
```
    `.trim();

    const result = validator.validate(code);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unsupported or missing diagram directive");
  });

  test("should detect unbalanced square brackets", () => {
    const code = `
graph TD
    A[Client --> B[Server]
    `.trim();

    const result = validator.validate(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unbalanced square brackets"))).toBe(true);
  });

  test("should catch prohibited javascript: links and HTML injection", () => {
    const code = `
graph TD
    A[Client] --> B[Server]
    click A href "javascript:alert(1)"
    C[<script>alert('xss')</script>]
    `.trim();

    const result = validator.validate(code);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("javascript:"))).toBe(true);
    expect(result.errors.some((e) => e.includes("<script>"))).toBe(true);
  });

  test("should enforce maximum line limit", () => {
    const lines = ["graph TD"];
    for (let i = 0; i < 70; i++) {
      lines.push(`    A${i} --> B${i}`);
    }
    const code = lines.join("\n");

    const result = validator.validate(code, { maxLines: 50 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("exceeds maximum limit"))).toBe(true);
  });
});
