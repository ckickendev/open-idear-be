const { uploadService } = require("../../services");

/**
 * =============================================================================
 *  ASSET UPLOAD WORKFLOW
 *  ai/workflow/assetUpload.workflow.ts
 *
 *  Design Decisions:
 *  - Orchestrates the sequential pipeline: Validate -> Upload -> Save Metadata -> Return.
 *  - High-level orchestrator class decoupled from storage providers (Cloudinary).
 *  - Depends exclusively on UploadService for image processing and persistence.
 * =============================================================================
 */

export interface AssetUploadInput {
  readonly userId: string;
  readonly file: {
    readonly buffer: Buffer;
    readonly originalname: string;
    readonly mimetype: string;
  };
  readonly options?: {
    readonly description?: string;
    readonly alt?: string;
    readonly tags?: string[];
  };
}

export class AssetUploadWorkflow {
  /**
   * Executes the asset upload workflow.
   * Receives files parameters, validates bounds, and saves metadata.
   */
  async execute(input: AssetUploadInput) {
    const { userId, file, options = {} } = input;

    // Delegate execution steps to the Upload Service
    return await uploadService.upload(userId, file, options);
  }
}
