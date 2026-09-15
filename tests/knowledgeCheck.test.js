const assert = require("assert");

console.log("Running Knowledge Check & Video Chapters Unit Tests...");

// 1. Test Learner Payload Answer Key Stripping
{
    const fullCheck = {
        _id: "66d1a4e20000000000000001",
        lesson: "66d1a4b10000000000000001",
        version: 1,
        questions: [
            {
                id: "q_1",
                question: "What is the key benefit of React Server Components?",
                options: [
                    { id: "opt_1", text: "Zero client-side bundle size for server components" },
                    { id: "opt_2", text: "Requires WebSockets for rendering" },
                    { id: "opt_3", text: "Runs only in client browser" },
                    { id: "opt_4", text: "Disables caching completely" },
                ],
                correctOptionId: "opt_1",
                explanation: "Server components execute on the server and do not add JS bundle to client.",
                cognitiveLevel: "understand",
            },
        ],
    };

    // Learner projection logic
    const learnerQuestions = fullCheck.questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        cognitiveLevel: q.cognitiveLevel,
    }));

    const learnerPayload = {
        _id: fullCheck._id,
        lesson: fullCheck.lesson,
        version: fullCheck.version,
        totalQuestions: learnerQuestions.length,
        questions: learnerQuestions,
    };

    assert.strictEqual(learnerPayload.questions[0].correctOptionId, undefined, "Learner payload MUST NOT contain correctOptionId");
    assert.strictEqual(learnerPayload.questions[0].explanation, undefined, "Learner payload MUST NOT contain explanation");
    assert.strictEqual(learnerPayload.questions[0].options.length, 4, "Learner payload must contain all 4 options");
    console.log("✓ Test 1: Answer Key & Internal Metadata Stripping passed");
}

// 2. Test Server-Side Attempt Scoring
{
    const questions = [
        { id: "q_1", correctOptionId: "opt_1", explanation: "Exp 1" },
        { id: "q_2", correctOptionId: "opt_3", explanation: "Exp 2" },
        { id: "q_3", correctOptionId: "opt_2", explanation: "Exp 3" },
        { id: "q_4", correctOptionId: "opt_4", explanation: "Exp 4" },
    ];

    const submittedAnswers = [
        { questionId: "q_1", selectedOptionId: "opt_1" }, // Correct
        { questionId: "q_2", selectedOptionId: "opt_3" }, // Correct
        { questionId: "q_3", selectedOptionId: "opt_1" }, // Wrong (expected opt_2)
        { questionId: "q_4", selectedOptionId: "opt_4" }, // Correct
    ];

    const answerMap = new Map();
    submittedAnswers.forEach((ans) => answerMap.set(ans.questionId, ans.selectedOptionId));

    let correctCount = 0;
    questions.forEach((q) => {
        if (answerMap.get(q.id) === q.correctOptionId) {
            correctCount++;
        }
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= 70;

    assert.strictEqual(correctCount, 3, "Correct count must be exactly 3");
    assert.strictEqual(score, 75, "Score must be 75%");
    assert.strictEqual(passed, true, "Passed must be true for 75% >= 70%");
    console.log("✓ Test 2: Server-Side Attempt Scoring passed");
}

// 3. Test Knowledge Check Staleness Detection
{
    const currentMediaVersion = 2;
    const currentIntelVersion = 3;

    const freshCheck = {
        sourceMediaVersion: 2,
        sourceIntelligenceVersion: 3,
    };

    const staleMediaCheck = {
        sourceMediaVersion: 1,
        sourceIntelligenceVersion: 3,
    };

    const staleIntelCheck = {
        sourceMediaVersion: 2,
        sourceIntelligenceVersion: 2,
    };

    const isStale1 = (freshCheck.sourceMediaVersion !== currentMediaVersion) || (freshCheck.sourceIntelligenceVersion !== currentIntelVersion);
    const isStale2 = (staleMediaCheck.sourceMediaVersion !== currentMediaVersion) || (staleMediaCheck.sourceIntelligenceVersion !== currentIntelVersion);
    const isStale3 = (staleIntelCheck.sourceMediaVersion !== currentMediaVersion) || (staleIntelCheck.sourceIntelligenceVersion !== currentIntelVersion);

    assert.strictEqual(isStale1, false, "Fresh check should not be stale");
    assert.strictEqual(isStale2, true, "Check with outdated media version must be stale");
    assert.strictEqual(isStale3, true, "Check with outdated intelligence version must be stale");
    console.log("✓ Test 3: Knowledge Check Staleness Detection passed");
}

// 4. Test Video Chapter Marker Active State Resolution
{
    const chapterMarkers = [
        { title: "Intro", seconds: 0 },
        { title: "Fundamentals", seconds: 120 },
        { title: "Deep Dive", seconds: 300 },
        { title: "Summary", seconds: 600 },
    ];

    function getActiveChapterIndex(currentTime, markers) {
        if (!markers || markers.length === 0) return -1;
        let activeIdx = 0;
        for (let i = 0; i < markers.length; i++) {
            if (currentTime >= markers[i].seconds) {
                activeIdx = i;
            } else {
                break;
            }
        }
        return activeIdx;
    }

    assert.strictEqual(getActiveChapterIndex(10, chapterMarkers), 0, "Time 10s should be in Intro (0s)");
    assert.strictEqual(getActiveChapterIndex(120, chapterMarkers), 1, "Time 120s should be in Fundamentals (120s)");
    assert.strictEqual(getActiveChapterIndex(450, chapterMarkers), 2, "Time 450s should be in Deep Dive (300s)");
    assert.strictEqual(getActiveChapterIndex(750, chapterMarkers), 3, "Time 750s should be in Summary (600s)");
    console.log("✓ Test 4: Video Chapter Marker Active State Resolution passed");
}

console.log("\nAll Knowledge Check & Video Chapters Tests Passed Successfully!");
