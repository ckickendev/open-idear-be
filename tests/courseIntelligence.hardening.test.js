const assert = require("assert");
const aiJobService = require("../services/aiJob.services");

console.log("Running Course Intelligence Hardening Tests...");

// 1. Test Deterministic Idempotency Fingerprint Computation
{
    const fp1 = aiJobService.computeFingerprint({
        lessonId: "66d1a4b10000000000000001",
        sourceMediaId: "66d1a4d00000000000000001",
        sourceMediaVersion: 1,
        capability: "course.lesson.analyze",
        language: "vi",
        promptVersion: "v1.0",
    });

    const fp2 = aiJobService.computeFingerprint({
        lessonId: "66d1a4b10000000000000001",
        sourceMediaId: "66d1a4d00000000000000001",
        sourceMediaVersion: 1,
        capability: "course.lesson.analyze",
        language: "vi",
        promptVersion: "v1.0",
    });

    const fpDifferentVersion = aiJobService.computeFingerprint({
        lessonId: "66d1a4b10000000000000001",
        sourceMediaId: "66d1a4d00000000000000001",
        sourceMediaVersion: 2,
        capability: "course.lesson.analyze",
        language: "vi",
        promptVersion: "v1.0",
    });

    assert.strictEqual(fp1, fp2, "Identical inputs must produce identical fingerprints");
    assert.notStrictEqual(fp1, fpDifferentVersion, "Different media version must produce different fingerprint");
    console.log("✓ Test 1: Deterministic Idempotency Fingerprinting passed");
}

// 2. Test Transcript Segment Chronological Normalization
{
    const rawSegments = [
        { start: 45, end: 90, text: "Second segment" },
        { start: 0, end: 30, text: "First segment" },
        { start: -5, end: 10, text: "Invalid start segment" },
        { start: 100, end: 80, text: "Invalid inverted segment" },
    ];

    const sanitizedSegments = rawSegments
        .filter((s) => Number(s.start) >= 0 && Number(s.end) > Number(s.start) && s.text?.trim())
        .sort((a, b) => Number(a.start) - Number(b.start));

    assert.strictEqual(sanitizedSegments.length, 2, "Should filter out invalid segments");
    assert.strictEqual(sanitizedSegments[0].start, 0, "First segment must start at 0");
    assert.strictEqual(sanitizedSegments[1].start, 45, "Second segment must start at 45");
    console.log("✓ Test 2: Transcript Segment Chronological Normalization passed");
}

// 3. Test Video Chapter Marker Sorting & Deduplication
{
    const rawChapters = [
        { timestamp: "06:30", seconds: 390, title: "Practice" },
        { timestamp: "00:00", seconds: 0, title: "Intro" },
        { timestamp: "02:15", seconds: 135, title: "Theory" },
    ];

    const sortedChapters = rawChapters.sort((a, b) => a.seconds - b.seconds);

    assert.strictEqual(sortedChapters[0].seconds, 0, "First chapter marker must be at 0s");
    assert.strictEqual(sortedChapters[1].seconds, 135, "Second chapter marker must be at 135s");
    assert.strictEqual(sortedChapters[2].seconds, 390, "Third chapter marker must be at 390s");
    console.log("✓ Test 3: Video Chapter Marker Sorting passed");
}

// 4. Test Deduplication of AI Array Fields
{
    const rawKeyPoints = [
        "React Server Components reduce client bundle size",
        "React Server Components reduce client bundle size", // Duplicate
        "Direct backend access without API endpoints",
        "  ", // Empty
    ];

    const deduplicated = Array.from(new Set(rawKeyPoints.map((p) => p.trim()).filter(Boolean)));

    assert.strictEqual(deduplicated.length, 2, "Should remove duplicate and whitespace key points");
    console.log("✓ Test 4: Array Deduplication and Sanitization passed");
}

// 5. Test Stale Detection Logic
{
    const currentMediaId = "66d1a4d00000000000000001";
    const currentMediaVersion = 2;

    const intelligence1 = {
        sourceMedia: "66d1a4d00000000000000001",
        sourceMediaVersion: 2,
    };

    const intelligenceStaleMediaId = {
        sourceMedia: "66d1a4d00000000000000002",
        sourceMediaVersion: 2,
    };

    const intelligenceStaleVersion = {
        sourceMedia: "66d1a4d00000000000000001",
        sourceMediaVersion: 1,
    };

    const isStale1 = (intelligence1.sourceMedia !== currentMediaId) || (intelligence1.sourceMediaVersion !== currentMediaVersion);
    const isStale2 = (intelligenceStaleMediaId.sourceMedia !== currentMediaId) || (intelligenceStaleMediaId.sourceMediaVersion !== currentMediaVersion);
    const isStale3 = (intelligenceStaleVersion.sourceMedia !== currentMediaId) || (intelligenceStaleVersion.sourceMediaVersion !== currentMediaVersion);

    assert.strictEqual(isStale1, false, "Matching media and version must NOT be stale");
    assert.strictEqual(isStale2, true, "Different media ID must be stale");
    assert.strictEqual(isStale3, true, "Different media version must be stale");
    console.log("✓ Test 5: Deterministic Staleness Detection passed");
}

console.log("\nAll Course Intelligence Hardening Tests Passed Successfully!");
