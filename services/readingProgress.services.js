const mongoose = require("mongoose");
const { ReadingProgress, Post } = require("../models");

// =============================================================================
//  READING PROGRESS SERVICE
//  services/readingProgress.services.js
//
//  Design Decisions:
//  - Implements Kindle + Medium reading state synchronization.
//  - Monotonic Progress: Reading percentage never rolls backwards accidentally
//    (e.g., if a user scrolls back up to check a diagram or reference).
//  - Meaningful Write Filtering: Skips database writes if progress delta < 2%
//    and heading has not changed, avoiding write amplification.
//  - Automatic Completion: Automatically sets completedAt when progress >= 90%
//    and bottom of the article is reached.
//  - Resilient Article Resolution: Accepts either MongoDB ObjectId or slug.
// =============================================================================

class ReadingProgressService {
  /**
   * Helper: Resolves an article document by ObjectId or slug.
   */
  async resolveArticle(articleIdOrSlug) {
    if (!articleIdOrSlug) return null;

    if (mongoose.Types.ObjectId.isValid(articleIdOrSlug)) {
      const post = await Post.findById(articleIdOrSlug);
      if (post) return post;
    }

    return await Post.findOne({ slug: String(articleIdOrSlug).toLowerCase().trim() });
  }

  /**
   * Helper: Calculates estimated reading time in minutes from content or AI metadata.
   */
  calculateReadingMinutes(post) {
    if (!post) return 1;

    // Check if AI writer output has estimatedReadingTime
    const aiEstimate = post.aiContext?.writerOutput?.estimatedReadingTime;
    if (typeof aiEstimate === "number" && aiEstimate > 0) {
      return aiEstimate;
    }

    // Fallback: estimate from text / content word count (average 200 wpm)
    const rawText = post.text || post.content || "";
    const wordCount = rawText.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(wordCount / 200));
  }

  /**
   * GET /reading/continue
   * Returns recently opened and partially read articles for the user.
   */
  async getContinueReading(userId, limit = 6) {
    if (!userId) return [];

    const safeLimit = Math.min(20, Math.max(1, Number(limit) || 6));

    // Retrieve active reading records (not fully finished or recently read)
    const records = await ReadingProgress.find({
      userId,
      progress: { $gt: 0, $lt: 100 },
      completedAt: null,
    })
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .populate({
        path: "articleId",
        select: "title slug description image author category aiContext content text createdAt updatedAt",
        populate: [
          { path: "image", select: "url thumbnail alt" },
          { path: "category", select: "name slug" },
          { path: "author", select: "name username avatar avatarUrl" },
        ],
      })
      .lean();

    // Map and enrich with remaining time calculation
    return records
      .filter((rec) => rec.articleId && rec.articleId.title)
      .map((rec) => {
        const article = rec.articleId;
        const totalMinutes = this.calculateReadingMinutes(article);
        const progressPct = Math.min(100, Math.max(0, rec.progress || 0));
        const remainingMinutes = Math.max(1, Math.ceil(totalMinutes * (1 - progressPct / 100)));

        return {
          id: rec._id,
          articleId: article._id,
          slug: article.slug,
          title: article.title,
          description: article.description,
          thumbnail: article.image?.url || article.image?.thumbnail || null,
          author: article.author,
          category: article.category,
          progress: progressPct,
          lastHeadingId: rec.lastHeadingId,
          lastParagraphIndex: rec.lastParagraphIndex,
          totalReadingMinutes: totalMinutes,
          remainingMinutes,
          updatedAt: rec.updatedAt,
        };
      });
  }

  /**
   * GET /reading/:articleId
   * Returns progress for a specific article.
   */
  async getProgress(userId, articleIdOrSlug) {
    if (!userId || !articleIdOrSlug) return null;

    const post = await this.resolveArticle(articleIdOrSlug);
    if (!post) return null;

    const record = await ReadingProgress.findOne({
      userId,
      articleId: post._id,
    }).lean();

    if (!record) {
      return {
        articleId: post._id,
        slug: post.slug,
        progress: 0,
        lastHeadingId: null,
        lastParagraphIndex: null,
        completedAt: null,
        updatedAt: null,
      };
    }

    return {
      articleId: post._id,
      slug: post.slug,
      progress: record.progress,
      lastHeadingId: record.lastHeadingId,
      lastParagraphIndex: record.lastParagraphIndex,
      completedAt: record.completedAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * PUT /reading/:articleId
   * Updates user reading progress with debounce & monotonic protection.
   */
  async updateProgress(userId, articleIdOrSlug, data = {}) {
    if (!userId) {
      throw new Error("User authentication required");
    }

    const post = await this.resolveArticle(articleIdOrSlug);
    if (!post) {
      throw new Error("Article not found");
    }

    const inputProgress = Math.min(100, Math.max(0, Math.round(Number(data.progress) || 0)));
    const heading = data.heading || data.lastHeadingId || null;
    const paragraph = typeof data.paragraph === "number" ? data.paragraph : (typeof data.lastParagraphIndex === "number" ? data.lastParagraphIndex : null);
    const isBottomReached = Boolean(data.isBottomReached);

    let existing = await ReadingProgress.findOne({
      userId,
      articleId: post._id,
    });

    if (existing) {
      // ── Monotonic Safeguard: never drop progress backwards accidentally ──
      const safeProgress = Math.max(existing.progress || 0, inputProgress);

      const progressDelta = Math.abs(safeProgress - (existing.progress || 0));
      const headingChanged = heading && heading !== existing.lastHeadingId;
      const paragraphChanged = paragraph !== null && paragraph !== existing.lastParagraphIndex;
      const shouldComplete = (safeProgress >= 90 && isBottomReached) || safeProgress >= 99;
      const newlyCompleted = shouldComplete && !existing.completedAt;

      // ── Meaningful Write Filter: avoid high frequency trivial writes ──
      if (progressDelta < 2 && !headingChanged && !paragraphChanged && !newlyCompleted) {
        return existing;
      }

      existing.progress = safeProgress;
      if (heading) existing.lastHeadingId = heading;
      if (paragraph !== null) existing.lastParagraphIndex = paragraph;
      if (newlyCompleted) existing.completedAt = new Date();

      await existing.save();
      return existing;
    }

    // ── Create New Progress Record ──
    const shouldComplete = (inputProgress >= 90 && isBottomReached) || inputProgress >= 99;
    const newRecord = await ReadingProgress.create({
      userId,
      articleId: post._id,
      progress: inputProgress,
      lastHeadingId: heading,
      lastParagraphIndex: paragraph,
      completedAt: shouldComplete ? new Date() : null,
    });

    return newRecord;
  }

  /**
   * GET /reading/stats/me
   * Calculates overall reading statistics for profile dashboard.
   */
  async getUserReadingStats(userId) {
    if (!userId) {
      return {
        completedArticles: 0,
        hoursRead: 0,
        currentStreak: 0,
        longestStreak: 0,
      };
    }

    // 1. Articles Completed
    const completedCount = await ReadingProgress.countDocuments({
      userId,
      $or: [{ completedAt: { $ne: null } }, { progress: { $gte: 90 } }],
    });

    // 2. Total Reading Hours Estimated
    const allProgress = await ReadingProgress.find({ userId })
      .populate({
        path: "articleId",
        select: "aiContext text content",
      })
      .lean();

    let totalMinutesRead = 0;
    const activeDates = new Set();

    for (const rec of allProgress) {
      if (!rec.articleId) continue;
      const totalArticleMins = this.calculateReadingMinutes(rec.articleId);
      const ratio = Math.min(1, Math.max(0, (rec.progress || 0) / 100));
      totalMinutesRead += totalArticleMins * ratio;

      if (rec.updatedAt) {
        const dateStr = new Date(rec.updatedAt).toISOString().split("T")[0];
        activeDates.add(dateStr);
      }
    }

    const hoursRead = Number((totalMinutesRead / 60).toFixed(1));

    // 3. Streak Architecture: calculate consecutive active days
    const sortedDates = Array.from(activeDates).sort().reverse();
    let currentStreak = 0;
    let longestStreak = 0;

    if (sortedDates.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      const yesterdayDate = new Date(Date.now() - 86400000).toISOString().split("T")[0];

      let checkDate = sortedDates.includes(today)
        ? new Date()
        : (sortedDates.includes(yesterdayDate) ? new Date(Date.now() - 86400000) : null);

      if (checkDate) {
        let tempDate = new Date(checkDate);
        while (true) {
          const formatted = tempDate.toISOString().split("T")[0];
          if (activeDates.has(formatted)) {
            currentStreak++;
            tempDate.setDate(tempDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      // Longest streak calculation
      let runningStreak = 0;
      let prevTimestamp = null;
      const chronologicalDates = Array.from(activeDates).sort();

      for (const dateStr of chronologicalDates) {
        const curr = new Date(dateStr).getTime();
        if (prevTimestamp === null) {
          runningStreak = 1;
        } else {
          const diffDays = Math.round((curr - prevTimestamp) / 86400000);
          if (diffDays === 1) {
            runningStreak++;
          } else if (diffDays > 1) {
            runningStreak = 1;
          }
        }
        prevTimestamp = curr;
        if (runningStreak > longestStreak) longestStreak = runningStreak;
      }
    }

    return {
      completedArticles: completedCount,
      hoursRead,
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
    };
  }
}

const readingProgressService = new ReadingProgressService();

module.exports = {
  ReadingProgressService,
  readingProgressService,
};
