const assert = require("assert");

console.log("Running Phase 3D: AI Learning System Audit & Consolidation Test Suite...\n");

// 1. Test Semantic Separation: Engagement cannot produce Mastered or Proficient
{
    function computeLevel(score, positiveComprehensionCount = 0) {
        if (score >= 90 && positiveComprehensionCount >= 2) return "mastered";
        if (score >= 75 && positiveComprehensionCount >= 1) return "proficient";
        if (score >= 50) return "developing";
        if (score >= 20) return "introduced";
        return "unknown";
    }

    function calculateConsolidatedScore(evidences) {
        let engagementScore = 0;
        let comprehensionScore = 0;
        let interactionScore = 0;
        let positiveComprehensionCount = 0;

        for (const ev of evidences) {
            if (ev.category === "engagement" || ev.type === "lesson_completion" || ev.type === "video_progress") {
                engagementScore = Math.min(20, engagementScore + 20 * (ev.strength || 1));
            } else if (ev.category === "comprehension" || ev.type === "knowledge_check" || ev.type === "re_attempt") {
                if (ev.signal === "positive") {
                    positiveComprehensionCount++;
                    comprehensionScore += 35 * (ev.strength || 1);
                } else {
                    comprehensionScore = Math.max(0, comprehensionScore - 25 * (ev.strength || 1));
                }
            } else if (ev.category === "interaction" || ev.type === "tutor_interaction") {
                if (ev.signal === "positive") {
                    interactionScore = Math.min(15, interactionScore + 10 * (ev.strength || 1));
                }
            }
        }

        const score = Math.min(100, Math.max(0, Math.round(engagementScore + comprehensionScore + interactionScore)));
        const level = computeLevel(score, positiveComprehensionCount);
        return { score, level, positiveComprehensionCount };
    }

    // Learner only watched video 10 times (Pure engagement, zero comprehension)
    const pureEngagement = Array(10).fill({ type: "video_progress", category: "engagement", signal: "positive" });
    const engResult = calculateConsolidatedScore(pureEngagement);

    assert.strictEqual(engResult.score, 20, "Engagement score must cap at 20 baseline");
    assert.strictEqual(engResult.level, "introduced", "Pure engagement must remain introduced, never mastered");
    console.log("✓ Test 1: Engagement vs Comprehension Semantic Separation passed");
}

// 2. Test Multi-Signal Comprehension Progression to True Mastery
{
    function computeLevel(score, positiveComprehensionCount = 0) {
        if (score >= 90 && positiveComprehensionCount >= 2) return "mastered";
        if (score >= 75 && positiveComprehensionCount >= 1) return "proficient";
        if (score >= 50) return "developing";
        if (score >= 20) return "introduced";
        return "unknown";
    }

    function calculateConsolidatedScore(evidences) {
        let engagementScore = 0;
        let comprehensionScore = 0;
        let interactionScore = 0;
        let positiveComprehensionCount = 0;

        for (const ev of evidences) {
            if (ev.category === "engagement" || ev.type === "lesson_completion") {
                engagementScore = Math.min(20, engagementScore + 20 * (ev.strength || 1));
            } else if (ev.category === "comprehension" || ev.type === "knowledge_check") {
                if (ev.signal === "positive") {
                    positiveComprehensionCount++;
                    comprehensionScore += 35 * (ev.strength || 1);
                } else {
                    comprehensionScore = Math.max(0, comprehensionScore - 25 * (ev.strength || 1));
                }
            } else if (ev.category === "interaction" || ev.type === "tutor_interaction") {
                if (ev.signal === "positive") {
                    interactionScore = Math.min(15, interactionScore + 10 * (ev.strength || 1));
                }
            }
        }

        const score = Math.min(100, Math.max(0, Math.round(engagementScore + comprehensionScore + interactionScore)));
        const level = computeLevel(score, positiveComprehensionCount);
        return { score, level, positiveComprehensionCount };
    }

    // Step 1: Watched video
    const s1 = [{ type: "lesson_completion", category: "engagement", signal: "positive" }];
    assert.deepStrictEqual(calculateConsolidatedScore(s1), { score: 20, level: "introduced", positiveComprehensionCount: 0 });

    // Step 2: Answered 1st quiz correctly
    const s2 = [...s1, { type: "knowledge_check", category: "comprehension", signal: "positive" }];
    assert.deepStrictEqual(calculateConsolidatedScore(s2), { score: 55, level: "developing", positiveComprehensionCount: 1 });

    // Step 3: Answered 2nd quiz correctly (2 independent comprehension signals)
    const s3 = [...s2, { type: "knowledge_check", category: "comprehension", signal: "positive" }];
    assert.deepStrictEqual(calculateConsolidatedScore(s3), { score: 90, level: "mastered", positiveComprehensionCount: 2 });

    // Step 4: Missed a question -> score drops
    const s4 = [...s3, { type: "knowledge_check", category: "comprehension", signal: "negative" }];
    assert.deepStrictEqual(calculateConsolidatedScore(s4), { score: 65, level: "developing", positiveComprehensionCount: 2 });

    console.log("✓ Test 2: Multi-Signal Comprehension Progression passed");
}

// 3. Test Idempotency Key De-duplication
{
    const existingKeys = new Set(["attempt_att123_q_q1", "tutor_msg456"]);

    function recordWithIdempotency(key) {
        if (existingKeys.has(key)) {
            return { duplicate: true };
        }
        existingKeys.add(key);
        return { duplicate: false };
    }

    assert.strictEqual(recordWithIdempotency("attempt_att123_q_q1").duplicate, true, "Existing attempt key must be detected as duplicate");
    assert.strictEqual(recordWithIdempotency("attempt_att123_q_q2").duplicate, false, "New question key must be accepted");
    console.log("✓ Test 3: Idempotency Key De-duplication passed");
}

// 4. Test Stale Intelligence Detection
{
    function isIntelligenceStale(mediaVersion, intelMediaVersion) {
        return (mediaVersion || 1) !== (intelMediaVersion || 1);
    }

    assert.strictEqual(isIntelligenceStale(1, 1), false, "Matching version is fresh");
    assert.strictEqual(isIntelligenceStale(2, 1), true, "New media version makes old intelligence stale");
    console.log("✓ Test 4: Stale Intelligence Detection passed");
}

// 5. Test Assessment Secret Isolation
{
    const rawQuestion = {
        id: "q_1",
        question: "What is Next.js App Router?",
        options: [{ id: "opt_1", text: "A" }, { id: "opt_2", text: "B" }],
        correctOptionId: "opt_1",
        explanation: "Internal explanation",
        objectiveReference: "Objective 1",
    };

    function stripSecrets(q) {
        return {
            id: q.id,
            question: q.question,
            options: q.options.map((o) => ({ id: o.id, text: o.text })),
            objectiveReference: q.objectiveReference,
        };
    }

    const sanitized = stripSecrets(rawQuestion);
    assert.strictEqual(sanitized.correctOptionId, undefined, "correctOptionId must be stripped");
    assert.strictEqual(sanitized.explanation, undefined, "explanation must be stripped");
    console.log("✓ Test 5: Assessment Secret Isolation passed");
}

console.log("\nAll Phase 3D: AI Learning System Audit & Consolidation Tests Passed Successfully!");
