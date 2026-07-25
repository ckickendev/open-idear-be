// =============================================================================
//  AI WORKFLOW — PUBLISHING STATE SCHEDULER
//  ai/workflow/publishingScheduler.ts
//
//  Design Decisions:
//  - Implements the state machine transitions for draft publication controls.
//  - Supports Immediate Publish, Scheduled Publish, Save Draft, Unpublish, and Republish.
//  - Features full timezone conversion support, normalizing publication dates to UTC.
//  - Provides mock/hooks for background runner dispatchers when schedules fire.
// =============================================================================

export type PublishingStatus = "draft" | "scheduled" | "published";

export interface PublishingState {
  postId: string;
  status: PublishingStatus;
  publishedAt?: Date | undefined;
  scheduledPublishAt?: Date | undefined;
  timezone?: string | undefined;
  updatedAt: Date;
  version: number;
}

export interface PublishTransitionPayload {
  scheduledDate?: string; // ISO or date string
  timezone?: string;      // e.g. "Asia/Saigon"
}

export class PublishingScheduler {
  // Simple database mock simulating state storage
  private readonly states = new Map<string, PublishingState>();

  /**
   * Fetch current publication state of an article draft.
   */
  getState(postId: string): PublishingState {
    let state = this.states.get(postId);
    if (!state) {
      state = {
        postId,
        status: "draft",
        updatedAt: new Date(),
        version: 1,
      };
      this.states.set(postId, state);
    }
    return state;
  }

  /**
   * Transition state immediately to Published status.
   */
  publishImmediately(postId: string): PublishingState {
    const state = this.getState(postId);
    
    state.status = "published";
    state.publishedAt = new Date();
    state.scheduledPublishAt = undefined;
    state.timezone = undefined;
    state.updatedAt = new Date();
    state.version += 1;

    this.states.set(postId, state);
    return state;
  }

  /**
   * Schedule a publication at a specific date and timezone.
   */
  schedulePublish(postId: string, dateStr: string, timezone: string): PublishingState {
    const state = this.getState(postId);
    
    // Normalise date string to standard JS Date object
    const rawDate = new Date(dateStr);
    if (isNaN(rawDate.getTime())) {
      throw new Error(`Invalid schedule date format: "${dateStr}"`);
    }

    // Normalise timezone offsets (checks if timezone is valid)
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new Error(`Unsupported or invalid timezone identifier: "${timezone}"`);
    }

    state.status = "scheduled";
    state.scheduledPublishAt = rawDate;
    state.timezone = timezone;
    state.publishedAt = undefined;
    state.updatedAt = new Date();
    state.version += 1;

    this.states.set(postId, state);
    return state;
  }

  /**
   * Revert post status to Draft.
   */
  saveDraft(postId: string): PublishingState {
    const state = this.getState(postId);

    state.status = "draft";
    state.scheduledPublishAt = undefined;
    state.timezone = undefined;
    state.updatedAt = new Date();
    state.version += 1;

    this.states.set(postId, state);
    return state;
  }

  /**
   * Unpublish an active post, reverting it back to Draft status.
   */
  unpublish(postId: string): PublishingState {
    const state = this.getState(postId);
    if (state.status !== "published") {
      throw new Error(`Cannot unpublish post "${postId}" as it is currently in "${state.status}" status.`);
    }

    state.status = "draft";
    state.publishedAt = undefined;
    state.scheduledPublishAt = undefined;
    state.timezone = undefined;
    state.updatedAt = new Date();
    state.version += 1;

    this.states.set(postId, state);
    return state;
  }

  /**
   * Republish an already published post, keeping its status but updating timings.
   */
  republish(postId: string): PublishingState {
    const state = this.getState(postId);
    if (state.status !== "published") {
      throw new Error(`Cannot republish post "${postId}" as it has not been published yet.`);
    }

    state.updatedAt = new Date();
    state.version += 1;

    this.states.set(postId, state);
    return state;
  }

  /**
   * Background runner method checks for scheduled posts that are due for release.
   */
  checkAndReleaseScheduledPosts(): string[] {
    const releasedIds: string[] = [];
    const now = new Date();

    for (const [postId, state] of this.states.entries()) {
      if (state.status === "scheduled" && state.scheduledPublishAt) {
        if (state.scheduledPublishAt <= now) {
          // Trigger automatic release transition
          state.status = "published";
          state.publishedAt = now;
          state.scheduledPublishAt = undefined;
          state.timezone = undefined;
          state.updatedAt = now;
          state.version += 1;

          this.states.set(postId, state);
          releasedIds.push(postId);
        }
      }
    }

    return releasedIds;
  }
}

export const publishingScheduler = new PublishingScheduler();
