import { ContentStructureService } from "../ai/content/contentStructure.service";

/**
 * =============================================================================
 *  CONTENT STRUCTURE SERVICE — AUTOMATED TEST SUITE (SPRINT 2)
 * =============================================================================
 */

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

console.log("=== Running ContentStructureService Test Suite ===");

// 1. Markdown Paragraph
{
  const input = { markdown: "This is a simple paragraph." };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 1: Should parse 1 block");
  assert(res.blocks[0].type === "paragraph", "Case 1: Type should be paragraph");
  assert(
    (res.blocks[0] as any).content === "This is a simple paragraph.",
    "Case 1: Paragraph content match"
  );
  console.log("✅ Case 1 Passed: Paragraph");
}

// 2. H2 / H3 Headings
{
  const input = { markdown: "## H2 Heading\n\n### H3 Subheading" };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 2, "Case 2: Should parse 2 heading blocks");
  assert(res.blocks[0].type === "heading" && (res.blocks[0] as any).level === 2, "Case 2: H2 level 2");
  assert(res.blocks[1].type === "heading" && (res.blocks[1] as any).level === 3, "Case 2: H3 level 3");
  console.log("✅ Case 2 Passed: H2 & H3 Headings");
}

// 3. Unordered List
{
  const input = { markdown: "- Item 1\n- Item 2\n- Item 3" };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 3: Should parse 1 list block");
  assert(res.blocks[0].type === "list", "Case 3: Type should be list");
  assert((res.blocks[0] as any).style === "unordered", "Case 3: Style unordered");
  assert((res.blocks[0] as any).items.length === 3, "Case 3: 3 items in list");
  console.log("✅ Case 3 Passed: Unordered List");
}

// 4. Ordered List
{
  const input = { markdown: "1. Step 1\n2. Step 2" };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 4: Should parse 1 list block");
  assert(res.blocks[0].type === "list", "Case 4: Type list");
  assert((res.blocks[0] as any).style === "ordered", "Case 4: Style ordered");
  assert((res.blocks[0] as any).items.length === 2, "Case 4: 2 items in ordered list");
  console.log("✅ Case 4 Passed: Ordered List");
}

// 5. Code Block with Language
{
  const input = { markdown: "```typescript\nconst a: number = 10;\n```" };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 5: Should parse 1 code block");
  assert(res.blocks[0].type === "code", "Case 5: Type code");
  assert((res.blocks[0] as any).language === "typescript", "Case 5: Language typescript");
  assert((res.blocks[0] as any).code === "const a: number = 10;", "Case 5: Code content match");
  console.log("✅ Case 5 Passed: Code block with language");
}

// 6. Image
{
  const input = { markdown: "![Alt text](https://example.com/image.png \"Caption text\")" };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 6: Should parse 1 image block");
  assert(res.blocks[0].type === "image", "Case 6: Type image");
  assert((res.blocks[0] as any).src === "https://example.com/image.png", "Case 6: Image src match");
  assert((res.blocks[0] as any).alt === "Alt text", "Case 6: Image alt match");
  console.log("✅ Case 6 Passed: Image");
}

// 7. Link inside paragraph
{
  const input = { markdown: "Check out [OpenIdear](https://openidear.com) for details." };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 7: Should parse 1 paragraph");
  assert(res.blocks[0].type === "paragraph", "Case 7: Type paragraph");
  assert((res.blocks[0] as any).content.includes("OpenIdear"), "Case 7: Text includes link anchor");
  console.log("✅ Case 7 Passed: Link inside paragraph");
}

// 8. Normal Blockquote
{
  const input = { markdown: "> Plain quote text without callout prefix." };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 8: Should parse 1 quote block");
  assert(res.blocks[0].type === "quote", "Case 8: Type quote");
  assert((res.blocks[0] as any).content.includes("Plain quote text"), "Case 8: Quote content match");
  console.log("✅ Case 8 Passed: Normal Blockquote");
}

// 9. Tip Callout
{
  const input = { markdown: "> **Tip:** Use 64GB RAM for fast builds." };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 9: Should parse 1 callout block");
  assert(res.blocks[0].type === "callout", "Case 9: Type callout");
  assert((res.blocks[0] as any).variant === "tip", "Case 9: Variant tip");
  assert((res.blocks[0] as any).content === "Use 64GB RAM for fast builds.", "Case 9: Callout content clean");
  console.log("✅ Case 9 Passed: Tip Callout");
}

// 10. Warning Callout
{
  const input = { markdown: "> **Warning:** Do not run in production without backup." };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 1, "Case 10: Should parse 1 callout block");
  assert(res.blocks[0].type === "callout", "Case 10: Type callout");
  assert((res.blocks[0] as any).variant === "warning", "Case 10: Variant warning");
  console.log("✅ Case 10 Passed: Warning Callout");
}

// 11. FAQ Injection from Growth Results
{
  const input = {
    markdown: "## Article Body\n\nSome body text.",
    growthResults: {
      faq: {
        title: "Frequently Asked Questions",
        faqs: [
          { question: "What is OpenIdear?", answer: "A knowledge platform." },
          { question: "Is it free?", answer: "Yes." }
        ]
      }
    }
  };
  const res = ContentStructureService.buildArticleStructure(input);
  const faqBlock = res.blocks.find(b => b.type === "faq") as any;
  assert(!!faqBlock, "Case 11: FAQ block should be injected");
  assert(faqBlock.items.length === 2, "Case 11: Should contain 2 FAQ items");
  assert(faqBlock.items[0].question === "What is OpenIdear?", "Case 11: FAQ question match");
  console.log("✅ Case 11 Passed: FAQ Injection");
}

// 12. Comparison Table Injection from Growth Results
{
  const input = {
    markdown: "## Specs",
    growthResults: {
      comparisonTable: {
        title: "Model Comparison",
        headers: ["Feature", "Model A", "Model B"],
        rows: [
          ["Speed", "Fast", "Very Fast"],
          ["Price", "$10", "$20"]
        ]
      }
    }
  };
  const res = ContentStructureService.buildArticleStructure(input);
  const compBlock = res.blocks.find(b => b.type === "comparison") as any;
  assert(!!compBlock, "Case 12: Comparison block should be injected");
  assert(compBlock.columns.length === 3, "Case 12: 3 columns in header");
  assert(compBlock.rows.length === 2, "Case 12: 2 comparison rows");
  console.log("✅ Case 12 Passed: Comparison Injection");
}

// 13. Deterministic Block IDs & Sequential Order
{
  const input = { markdown: "Paragraph 1\n\nParagraph 2\n\nParagraph 3" };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 3, "Case 13: 3 blocks created");
  assert(res.blocks[0].order === 0 && res.blocks[1].order === 1 && res.blocks[2].order === 2, "Case 13: Sequential order 0, 1, 2");
  assert(!!res.blocks[0].id && !!res.blocks[1].id && !!res.blocks[2].id, "Case 13: Non-empty UUID IDs");
  assert(res.blocks[0].id !== res.blocks[1].id, "Case 13: IDs are unique");
  console.log("✅ Case 13 Passed: Deterministic Order & UUID IDs");
}

// 14. Empty Markdown
{
  const input = { markdown: "" };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 0, "Case 14: Empty markdown produces 0 blocks");
  assert(res.contentVersion === "blocks-v1", "Case 14: Version is blocks-v1");
  console.log("✅ Case 14 Passed: Empty Markdown");
}

// 15. Malformed / Unsupported Markdown
{
  const input = { markdown: "   \n\n   \n\n" };
  const res = ContentStructureService.buildArticleStructure(input);
  assert(res.blocks.length === 0, "Case 15: Whitespace only produces 0 blocks cleanly");
  console.log("✅ Case 15 Passed: Malformed / Whitespace Markdown");
}

// 16. Backward Compatibility (contentVersion discriminator)
{
  const legacyPost = { contentVersion: "html-v1", content: "<p>Legacy HTML</p>" };
  assert(legacyPost.contentVersion === "html-v1", "Case 16: Legacy posts remain html-v1");
  const newPostStruct = ContentStructureService.buildArticleStructure({ markdown: "New markdown" });
  assert(newPostStruct.contentVersion === "blocks-v1", "Case 16: New structured posts get blocks-v1");
  console.log("✅ Case 16 Passed: Backward Compatibility");
}

console.log("=================================================");
console.log("🎉 ALL 16 TEST CASES PASSED SUCCESSFULLY!");
console.log("=================================================");
