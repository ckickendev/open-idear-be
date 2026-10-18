// =============================================================================
//  SEARCH QUERY BUILDER — SPRINT 1 FOUNDATION
//  services/imageSearch/searchQueryBuilder.ts
//
//  Design Decisions:
//  - Builds deterministic, highly relevant queries from visual suggestions
//    rather than naively searching the article title.
//  - Avoids LLM calls for every query (fast, zero cost, deterministic).
//  - Preserves factual accuracy (does NOT hallucinate or invent unsupported details).
//  - Prioritizes existing relevant searchQuery when already provided.
//  - Enriches specific technology entities (e.g. "RTX 4060" -> "NVIDIA GeForce RTX 4060 graphics card").
//  - Appends appropriate visual modifiers based on visualType (product photography, architecture diagram, etc.).
// =============================================================================

export interface SearchQueryContext {
  query?: string;
  searchQuery?: string;
  imagePrompt?: string;
  heading?: string;
  articleTitle?: string;
  sectionContent?: string;
  visualType?: string;
  visualSuggestionId?: string;
}

/**
 * Strips editorial noise, numbering, and generic prefixes from titles/headings.
 * e.g., "1.2: RTX 4060 physical design" -> "RTX 4060 physical design"
 */
export function cleanSectionHeading(raw?: string): string {
  if (!raw) return "";
  let cleaned = raw.trim();

  // Strip wrapping quotes
  cleaned = cleaned.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

  // Strip editorial prefixes like "Section 1:", "Phần 2:", "Tool 3:", "Bước 1:"
  cleaned = cleaned.replace(
    /^(?:công\s+cụ|tiện\s+ích|phần\s+mềm|bước|phần|mục|chương|bài|tool|step|section|part|chapter)\s*(?:[0-9ivx]+|[a-z])?[:\s\-–—.]+/i,
    ""
  );

  // Strip leading numbers e.g. "1.", "2.1", "III -"
  cleaned = cleaned.replace(/^(?:[0-9]+(?:\.[0-9]+)*|[ivx]+)[.):\s\-–—]+/i, "");

  // Strip trailing punctuation
  cleaned = cleaned.replace(/[:;.\-–—\s]+$/, "").trim();

  return cleaned || raw.trim();
}

/**
 * Known hardware and technology entity mappings for accurate query expansion.
 */
interface EntityPattern {
  readonly match: RegExp;
  readonly canonicalName: string;
  readonly category: "gpu" | "cpu" | "ram" | "motherboard" | "cooling" | "cloud" | "database" | "mobile" | "general";
}

const KNOWN_TECH_ENTITIES: EntityPattern[] = [
  // GPUs
  { match: /\b(?:rtx\s*4090)\b/i, canonicalName: "NVIDIA GeForce RTX 4090", category: "gpu" },
  { match: /\b(?:rtx\s*4080)\b/i, canonicalName: "NVIDIA GeForce RTX 4080", category: "gpu" },
  { match: /\b(?:rtx\s*4070(?:\s*ti)?)\b/i, canonicalName: "NVIDIA GeForce RTX 4070", category: "gpu" },
  { match: /\b(?:rtx\s*4060(?:\s*ti)?)\b/i, canonicalName: "NVIDIA GeForce RTX 4060", category: "gpu" },
  { match: /\b(?:rtx\s*3090)\b/i, canonicalName: "NVIDIA GeForce RTX 3090", category: "gpu" },
  { match: /\b(?:rtx\s*3080)\b/i, canonicalName: "NVIDIA GeForce RTX 3080", category: "gpu" },
  { match: /\b(?:rtx\s*3070)\b/i, canonicalName: "NVIDIA GeForce RTX 3070", category: "gpu" },
  { match: /\b(?:rtx\s*3060)\b/i, canonicalName: "NVIDIA GeForce RTX 3060", category: "gpu" },
  { match: /\b(?:rx\s*7900\s*(?:xtx|xt)?)\b/i, canonicalName: "AMD Radeon RX 7900", category: "gpu" },
  { match: /\b(?:rx\s*7800\s*xt?)\b/i, canonicalName: "AMD Radeon RX 7800", category: "gpu" },

  // CPUs
  { match: /\b(?:intel\s+core\s+i9|core\s+i9|i9(?:\s+cpus?)?|i9-[0-9]+k?)\b/i, canonicalName: "Intel Core i9 processor", category: "cpu" },
  { match: /\b(?:intel\s+core\s+i7|core\s+i7|i7(?:\s+cpus?)?|i7-[0-9]+k?)\b/i, canonicalName: "Intel Core i7 processor", category: "cpu" },
  { match: /\b(?:intel\s+core\s+i5|core\s+i5|i5(?:\s+cpus?)?|i5-[0-9]+k?)\b/i, canonicalName: "Intel Core i5 processor", category: "cpu" },
  { match: /\b(?:ryzen\s*9|ryzen\s*7950x?)\b/i, canonicalName: "AMD Ryzen 9 processor", category: "cpu" },
  { match: /\b(?:ryzen\s*7|ryzen\s*7800x3d?)\b/i, canonicalName: "AMD Ryzen 7 processor", category: "cpu" },
  { match: /\b(?:apple\s+m3|m3\s+max|m3\s+pro)\b/i, canonicalName: "Apple M3 silicon chip", category: "cpu" },

  // Cooling & Thermal Hardware
  { match: /\b(?:thermal\s*paste|keo\s*tản\s*nhiệt|thermal\s*compound)\b/i, canonicalName: "thermal paste cpu", category: "cooling" },
  { match: /\b(?:liquid\s*cooler|aio(?:\s*cooler)?|all-in-one\s*(?:liquid\s*)?cooler|tản\s*nhiệt\s*nước)\b/i, canonicalName: "aio liquid cooler pc", category: "cooling" },
  { match: /\b(?:air\s*cooler|cpu\s*cooler|heatsink|tản\s*nhiệt\s*khí)\b/i, canonicalName: "cpu air cooler heatsink", category: "cooling" },
  { match: /\b(?:case\s*airflow|pc\s*airflow|cooling\s*airflow|quạt\s*tản\s*nhiệt|case\s*fan)\b/i, canonicalName: "computer case fan airflow", category: "cooling" },
  { match: /\b(?:cooling\s*solution|cpu\s*cooling|cooling\s*requirement|run\s*hot)\b/i, canonicalName: "cpu cooling heatsink", category: "cooling" },

  // Motherboards & RAM
  { match: /\b(?:motherboard|bo\s*mạch\s*chủ|mainboard|motherboard\s*socket)\b/i, canonicalName: "computer motherboard circuit board", category: "motherboard" },
  { match: /\b(?:ddr5|ddr4|ram|memory\s*module)\b/i, canonicalName: "ddr5 ram memory module", category: "ram" },

  // Databases & Infrastructure
  { match: /\bredis\b/i, canonicalName: "Redis cache", category: "database" },
  { match: /\bkafka\b/i, canonicalName: "Apache Kafka", category: "database" },
  { match: /\bpostgres(?:ql)?\b/i, canonicalName: "PostgreSQL database", category: "database" },
  { match: /\bmongodb\b/i, canonicalName: "MongoDB database", category: "database" },
  { match: /\bkubernetes|k8s\b/i, canonicalName: "Kubernetes cluster", category: "cloud" },
  { match: /\bdocker\b/i, canonicalName: "Docker container", category: "cloud" },
];

/**
 * Builds an optimal search query from available suggestion context.
 */
export function buildSearchQuery(context: SearchQueryContext): string {
  // 1. If visual suggestion has an existing searchQuery that is already specific and without sentence noise, prioritize it
  if (context.searchQuery && context.searchQuery.trim().length >= 5) {
    const raw = context.searchQuery.trim();
    const hasSentenceNoise = raw.includes("hardware photo") || raw.includes("diagram architecture") || /^(?:importance of|mistake\s+[0-9]+|common mistakes|why\s+)/i.test(raw);
    if (!hasSentenceNoise) {
      return cleanSearchText(raw);
    }
    for (const entity of KNOWN_TECH_ENTITIES) {
      if (entity.match.test(raw)) {
        return entity.canonicalName;
      }
    }
    return cleanSearchText(raw);
  }

  // 2. If explicit query is provided, check for sentence noise or clean it
  if (context.query && context.query.trim().length >= 3) {
    const raw = context.query.trim();
    const hasSentenceNoise = raw.includes("hardware photo") || raw.includes("diagram architecture") || /^(?:importance of|mistake\s+[0-9]+|common mistakes|why\s+)/i.test(raw);
    if (hasSentenceNoise) {
      for (const entity of KNOWN_TECH_ENTITIES) {
        if (entity.match.test(raw)) {
          return entity.canonicalName;
        }
      }
    }
    return cleanSearchText(raw);
  }

  const cleanHeading = cleanSectionHeading(context.heading);
  const cleanTitle = cleanSectionHeading(context.articleTitle);
  const vType = (context.visualType || "").toLowerCase();
  const textCorpus = `${cleanHeading} ${cleanTitle} ${context.sectionContent || ""}`.toLowerCase();

  // 3. Detect known entities
  let detectedEntity: EntityPattern | null = null;

  // Search heading first as it's the most focused scope
  for (const entity of KNOWN_TECH_ENTITIES) {
    if (entity.match.test(cleanHeading)) {
      detectedEntity = entity;
      break;
    }
  }

  // Fallback to title
  if (!detectedEntity) {
    for (const entity of KNOWN_TECH_ENTITIES) {
      if (entity.match.test(cleanTitle)) {
        detectedEntity = entity;
        break;
      }
    }
  }

  // 4. Determine visual intention & appropriate modifier
  const isProduct =
    vType === "product" ||
    vType === "search_image" ||
    /\b(?:physical design|unboxing|hands[- ]on|specs|hardware|camera|review|teardown)\b/i.test(cleanHeading);

  const isDiagram =
    vType === "diagram" ||
    /\b(?:architecture|how\s+it\s+works|data\s+flow|internals|topology|caching\s+works|pipeline)\b/i.test(textCorpus);

  const isBenchmark =
    vType === "chart" ||
    /\b(?:benchmark|performance|fps|latency|throughput|load\s+test)\b/i.test(textCorpus);

  // 5. Construct query based on detected entity and intent
  if (detectedEntity) {
    if (detectedEntity.category === "cooling" || detectedEntity.category === "motherboard" || detectedEntity.category === "ram") {
      return detectedEntity.canonicalName;
    }

    if (detectedEntity.category === "gpu") {
      if (isProduct) {
        return `${detectedEntity.canonicalName} graphics card product photography`;
      }
      if (isBenchmark) {
        return `${detectedEntity.canonicalName} gaming performance benchmark`;
      }
      return `${detectedEntity.canonicalName} graphics card hardware`;
    }

    if (detectedEntity.category === "database") {
      if (isDiagram) {
        return `${detectedEntity.canonicalName} architecture application database diagram`;
      }
      return `${detectedEntity.canonicalName} database architecture`;
    }

    if (detectedEntity.category === "cloud") {
      if (isDiagram) {
        return `${detectedEntity.canonicalName} architecture topology infrastructure diagram`;
      }
      return `${detectedEntity.canonicalName} cloud infrastructure`;
    }

    if (detectedEntity.category === "cpu") {
      if (isProduct) {
        return `${detectedEntity.canonicalName} hardware die photography`;
      }
      return `${detectedEntity.canonicalName} architecture`;
    }
  }

  // 6. Generic synthesis when no explicit entity pattern matched
  const baseSubject = cleanHeading || cleanTitle || "Technology";

  if (isProduct) {
    return cleanSearchText(`${baseSubject} product photography`);
  }
  if (isDiagram) {
    return cleanSearchText(`${baseSubject} architecture diagram`);
  }
  if (isBenchmark) {
    return cleanSearchText(`${baseSubject} benchmark metrics chart`);
  }

  return cleanSearchText(baseSubject);
}

/**
 * Deduplicates tokens and strips illegal punctuation while preserving order.
 */
export function cleanSearchText(input: string): string {
  if (!input) return "";

  let sanitized = input
    .replace(/[#*`_~[\](){}<>!|\\^]/g, " ")
    .replace(/\s+(?:hardware photo|hardware photography|diagram architecture|architecture diagram)$/i, "")
    .replace(/^(?:importance of|common mistakes to avoid when|mistake\s+[0-9]+[:\-.]*|why\s+[a-z0-9]+\s+run\s+hot|recommending|underestimating|how to|guide to|best practices for|an introduction to|good|bad)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) sanitized = input.trim();

  // Remove immediate duplicate words (case-insensitive)
  const words = sanitized.split(" ");
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      deduped.push(w);
    }
  }

  return deduped.join(" ").slice(0, 150);
}
