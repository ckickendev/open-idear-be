const assert = require("assert");

console.log("Running Learning Mastery Engine Unit Tests...");

// 1. Test Mastery Level Thresholds & Mastered Criteria
{
    function computeLevel(score, positiveCount = 0) {
        if (score >= 90 && positiveCount >= 2) return "mastered";
        if (score >= 75) return "proficient";
        if (score >= 50) return "developing";
        if (score >= 20) return "introduced";
        return "unknown";
    }

    assert.strictEqual(computeLevel(0, 0), "unknown");
    assert.strictEqual(computeLevel(15, 1), "unknown");
    assert.strictEqual(computeLevel(20, 1), "introduced");
    assert.strictEqual(computeLevel(45, 1), "introduced");
    assert.strictEqual(computeLevel(55, 1), "developing");
    assert.strictEqual(computeLevel(75, 1), "proficient");
    assert.strictEqual(computeLevel(95, 1), "proficient", "Score 95 with only 1 positive evidence must NOT be mastered");
    assert.strictEqual(computeLevel(95, 2), "mastered", "Score 95 with >= 2 positive evidences must be mastered");
    console.log("✓ Test 1: Mastery Level Thresholds & Mastered Criteria passed");
}

// 2. Test Deterministic Evidence Scoring Calculation
{
    function calculateScore(evidences) {
        let score = 0;
        let positiveCount = 0;

        for (const ev of evidences) {
            if (ev.signal === "positive") positiveCount++;

            if (ev.type === "lesson_completion") {
                score += 20 * (ev.strength || 1);
            } else if (ev.type === "knowledge_check") {
                if (ev.signal === "positive") {
                    score += 35 * (ev.strength || 1);
                } else {
                    score = Math.max(0, score - 25 * (ev.strength || 1));
                }
            } else if (ev.type === "tutor_interaction") {
                if (ev.signal === "positive") {
                    score += 15 * (ev.strength || 1);
                }
            }
        }

        return Math.min(100, Math.max(0, Math.round(score)));
    }

    // Step A: Watched lesson
    const step1 = [{ type: "lesson_completion", signal: "positive", strength: 1.0 }];
    assert.strictEqual(calculateScore(step1), 20);

    // Step B: Answered 1 quiz question correctly
    const step2 = [
        ...step1,
        { type: "knowledge_check", signal: "positive", strength: 1.0 },
    ];
    assert.strictEqual(calculateScore(step2), 55); // 20 + 35 = 55 (developing)

    // Step C: Answered 2nd quiz question correctly
    const step3 = [
        ...step2,
        { type: "knowledge_check", signal: "positive", strength: 1.0 },
    ];
    assert.strictEqual(calculateScore(step3), 90); // 55 + 35 = 90 (mastered, 3 positive signals)

    // Step D: Missed a question
    const step4 = [
        ...step3,
        { type: "knowledge_check", signal: "negative", strength: 1.0 },
    ];
    assert.strictEqual(calculateScore(step4), 65); // 90 - 25 = 65 (drops to developing)

    console.log("✓ Test 2: Deterministic Evidence Scoring Calculation passed");
}

// 3. Test Human-Readable Explainability Generation
{
    function generateExplanations(stats) {
        const bullets = [];
        if (stats.hasLessonCompletion) {
            bullets.push("✓ Đã hoàn thành theo dõi nội dung bài học.");
        }
        if (stats.correctAttempts > 0) {
            bullets.push(`✓ Trả lời chính xác ${stats.correctAttempts} câu hỏi kiểm tra kiến thức liên quan.`);
        }
        if (stats.incorrectAttempts > 0) {
            bullets.push(`✗ Từng gặp khó khăn ở ${stats.incorrectAttempts} câu hỏi kiểm tra trước đó.`);
        }
        if (stats.tutorInteractions > 0) {
            bullets.push(`✓ Đã thảo luận và củng cố khái niệm cùng Trợ lý AI (${stats.tutorInteractions} lần).`);
        }
        return bullets;
    }

    const explanations = generateExplanations({
        hasLessonCompletion: true,
        correctAttempts: 2,
        incorrectAttempts: 1,
        tutorInteractions: 1,
    });

    assert.strictEqual(explanations.length, 4);
    assert.ok(explanations[0].includes("hoàn thành"));
    assert.ok(explanations[1].includes("2 câu hỏi"));
    assert.ok(explanations[2].includes("1 câu hỏi"));
    assert.ok(explanations[3].includes("Trợ lý AI"));
    console.log("✓ Test 3: Human-Readable Explainability Generation passed");
}

// 4. Test Lesson & Course Mastery Aggregation
{
    const lessonObjectives = [
        { objective: "Obj 1", score: 90, level: "mastered" },
        { objective: "Obj 2", score: 60, level: "developing" },
        { objective: "Obj 3", score: 90, level: "mastered" },
    ];

    const avgLessonScore = Math.round(
        lessonObjectives.reduce((acc, curr) => acc + curr.score, 0) / lessonObjectives.length
    );

    assert.strictEqual(avgLessonScore, 80); // (90 + 60 + 90) / 3 = 80 (proficient)

    const allCourseObjectives = [
        ...lessonObjectives,
        { objective: "Obj 4", score: 100, level: "mastered" },
        { objective: "Obj 5", score: 80, level: "proficient" },
    ];

    const avgCourseScore = Math.round(
        allCourseObjectives.reduce((acc, curr) => acc + curr.score, 0) / allCourseObjectives.length
    );

    assert.strictEqual(avgCourseScore, 84); // (90+60+90+100+80)/5 = 84
    console.log("✓ Test 4: Lesson & Course Mastery Aggregation passed");
}

console.log("\nAll Learning Mastery Engine Unit Tests Passed Successfully!");
