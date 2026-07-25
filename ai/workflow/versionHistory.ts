// =============================================================================
//  AI WORKFLOW — VERSION HISTORY ENGINE
//  ai/workflow/versionHistory.ts
//
//  Design Decisions:
//  - Implements the snapshot repository pattern for draft versions history logs.
//  - Tracks Draft Saves, Published Versions, and Restored Versions.
//  - Supports timestamp comparisons, retrieval, and state restoration.
//  - Aligned with strict exactOptionalPropertyTypes compilation parameters.
// =============================================================================

export type VersionType = "draft" | "published" | "restored";

export interface VersionEntry {
  readonly id: string;
  readonly postId: string;
  readonly versionNumber: number;
  readonly type: VersionType;
  readonly title: string;
  readonly content: string;
  readonly metadata?: Record<string, any> | undefined;
  readonly createdAt: Date;
  readonly createdBy: string;
}

export class VersionHistoryManager {
  // Simple database mock simulating history entries storage
  private readonly history = new Map<string, VersionEntry[]>();

  /**
   * Commit a new version snapshot to history.
   */
  createVersion(
    postId: string,
    type: VersionType,
    title: string,
    content: string,
    createdBy: string,
    metadata?: Record<string, any>
  ): VersionEntry {
    const postHistory = this.history.get(postId) || [];
    const versionNumber = postHistory.length + 1;

    const entry: VersionEntry = {
      id: `${postId}-v${versionNumber}`,
      postId,
      versionNumber,
      type,
      title,
      content,
      metadata,
      createdAt: new Date(),
      createdBy,
    };

    postHistory.push(entry);
    this.history.set(postId, postHistory);
    return entry;
  }

  /**
   * List all historical versions for a post, sorted newest first.
   */
  listVersions(postId: string): VersionEntry[] {
    const postHistory = this.history.get(postId) || [];
    return [...postHistory].reverse();
  }

  /**
   * Retrieve a specific version snapshot.
   */
  getVersion(postId: string, versionNumber: number): VersionEntry {
    const postHistory = this.history.get(postId) || [];
    const entry = postHistory.find((v) => v.versionNumber === versionNumber);
    if (!entry) {
      throw new Error(`[VersionHistory] Version v${versionNumber} for post "${postId}" not found.`);
    }
    return entry;
  }

  /**
   * Restore a historical version. This recovers the content and
   * commits a new snapshot labeled "restored".
   */
  restoreVersion(postId: string, versionNumber: number, userId: string): VersionEntry {
    const targetVersion = this.getVersion(postId, versionNumber);
    
    // Create new restored marker version in history
    return this.createVersion(
      postId,
      "restored",
      targetVersion.title,
      targetVersion.content,
      userId,
      {
        restoredFromVersion: versionNumber,
        restoredAt: new Date().toISOString(),
        ...targetVersion.metadata,
      }
    );
  }

  /**
   * Simple logic to check if two snapshots differ.
   */
  hasChanges(v1: VersionEntry, v2: VersionEntry): boolean {
    return v1.title !== v2.title || v1.content !== v2.content;
  }
}

export const versionHistoryManager = new VersionHistoryManager();
