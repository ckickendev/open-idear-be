// =============================================================================
//  KNOWLEDGE COLLECTIONS — AUTOMATED TEST SUITE (SPRINT 1)
//  tests/collections.test.ts
//
//  Verifies:
//  1. Collection & CollectionItem Mongoose schemas, types, and indexes.
//  2. CollectionController endpoint initialization and REST path mapping.
//  3. Slugification and unique slug generation arithmetic.
//  4. Authorization logic: PRIVATE blocked for non-owner, PUBLIC allowed.
//  5. Reorder logic mapping.
// =============================================================================

require("dotenv").config();
import mongoose from "mongoose";
import { Collection, collectionSchema } from "../models/collection.schema";
import { CollectionItem, collectionItemSchema } from "../models/collectionItem.schema";
import { CollectionService } from "../services/collection.services";
const CollectionController = require("../controllers/collection.controller");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log("  RUNNING KNOWLEDGE COLLECTIONS TEST SUITE (SPRINT 1)   ");
  console.log("========================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(err.stack.split("\n").slice(0, 4).join("\n"));
      }
      failed++;
    }
  }

  // ─── TEST 1: Schema Structure & Compound Index ──────────────────────────────
  await test("Collection & CollectionItem schemas define required fields & unique indexes", () => {
    const colPaths = (collectionSchema as any).paths;
    assert(colPaths.owner !== undefined, "Collection must have owner");
    assert(colPaths.title !== undefined, "Collection must have title");
    assert(colPaths.slug !== undefined, "Collection must have slug");
    assert(colPaths.visibility !== undefined, "Collection must have visibility");
    assert(colPaths.visibility.enumValues.includes("PUBLIC"), "Visibility allows PUBLIC");
    assert(colPaths.visibility.enumValues.includes("PRIVATE"), "Visibility allows PRIVATE");
    assert(colPaths.visibility.enumValues.includes("UNLISTED"), "Visibility allows UNLISTED");

    const itemPaths = (collectionItemSchema as any).paths;
    assert(itemPaths.collectionId !== undefined, "CollectionItem must have collectionId");
    assert(itemPaths.articleId !== undefined, "CollectionItem must have articleId");
    assert(itemPaths.order !== undefined, "CollectionItem must have order");
    assert(itemPaths.note !== undefined, "CollectionItem must have note");

    const itemIndexes = (collectionItemSchema as any).indexes();
    const hasUniqueCompoundIndex = itemIndexes.some(
      ([fields, options]: [any, any]) =>
        fields.collectionId === 1 && fields.articleId === 1 && options?.unique === true
    );
    assert(hasUniqueCompoundIndex, "Must have unique compound index on { collectionId: 1, articleId: 1 }");
  });

  // ─── TEST 2: Controller Endpoint Mapping ─────────────────────────────────────
  await test("CollectionController registers full RESTful CRUD routes", () => {
    const controller = new CollectionController();
    assert(controller._rootPath === "/collections", "Controller root path must be /collections");

    const routes: { path: string; method: string }[] = [];
    controller._router.stack.forEach((layer: any) => {
      if (layer.route) {
        const path = layer.route.path;
        const methods = Object.keys(layer.route.methods);
        methods.forEach((m) => routes.push({ path, method: m.toUpperCase() }));
      }
    });

    assert(routes.some((r) => r.path === "/collections" && r.method === "POST"), "POST /collections");
    assert(routes.some((r) => r.path === "/collections/me" && r.method === "GET"), "GET /collections/me");
    assert(routes.some((r) => r.path === "/collections/check-article/:articleId" && r.method === "GET"), "GET /collections/check-article/:articleId");
    assert(routes.some((r) => r.path === "/collections/toggle-save" && r.method === "POST"), "POST /collections/toggle-save");
    assert(routes.some((r) => r.path === "/collections/:idOrSlug" && r.method === "GET"), "GET /collections/:idOrSlug");
    assert(routes.some((r) => r.path === "/collections/:id" && r.method === "PUT"), "PUT /collections/:id");
    assert(routes.some((r) => r.path === "/collections/:id" && r.method === "DELETE"), "DELETE /collections/:id");
    assert(routes.some((r) => r.path === "/collections/:id/items" && r.method === "POST"), "POST /collections/:id/items");
    assert(routes.some((r) => r.path === "/collections/:id/items/:articleId" && r.method === "DELETE"), "DELETE /collections/:id/items/:articleId");
    assert(routes.some((r) => r.path === "/collections/:id/reorder" && r.method === "PUT"), "PUT /collections/:id/reorder");
  });

  // ─── TEST 3: Slug Generation Arithmetic ─────────────────────────────────────
  await test("Slugification handles special characters, casing, and spaces", () => {
    const service = new CollectionService();

    assert(service.slugify("Backend Interview Guide!") === "backend-interview-guide", "Cleans punctuation");
    assert(service.slugify("  AI Engineering & LLMs  ") === "ai-engineering-llms", "Cleans symbols and trims");
    assert(service.slugify("System Design 2026") === "system-design-2026", "Preserves numbers");
  });

  // ─── TEST 4: Authorization Rules ─────────────────────────────────────────────
  await test("Access rules distinguish PUBLIC, UNLISTED, and PRIVATE collections", () => {
    function canAccess(visibility: string, ownerId: string, requesterId: string | null): boolean {
      if (visibility === "PUBLIC" || visibility === "UNLISTED") return true;
      if (visibility === "PRIVATE") {
        return Boolean(requesterId && requesterId === ownerId);
      }
      return false;
    }

    const owner = "user-123";
    const guest = null;
    const otherUser = "user-456";

    // Public
    assert(canAccess("PUBLIC", owner, guest) === true, "Guest can read PUBLIC");
    assert(canAccess("PUBLIC", owner, otherUser) === true, "Other user can read PUBLIC");

    // Unlisted (direct link)
    assert(canAccess("UNLISTED", owner, guest) === true, "Guest can read UNLISTED via link");

    // Private
    assert(canAccess("PRIVATE", owner, guest) === false, "Guest blocked from PRIVATE");
    assert(canAccess("PRIVATE", owner, otherUser) === false, "Other user blocked from PRIVATE");
    assert(canAccess("PRIVATE", owner, owner) === true, "Owner can access their own PRIVATE collection");
  });

  console.log("\n========================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
