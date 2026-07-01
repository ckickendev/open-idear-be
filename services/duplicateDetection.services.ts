import crypto from "crypto";
import sharp from "sharp";
import { Service } from "../core";

export interface DuplicateMatch {
  mediaId: string;
  originalFilename: string;
  urls: {
    original: string;
    thumbnail_md?: string;
  };
  matchType: "exact" | "near";
  distance: number; // Hamming distance (0 = identical layout, 1-8 = near duplicate)
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  sha256: string;
  pHash: string;
  matches: DuplicateMatch[];
}

export class DuplicateDetectionService extends Service {
  /**
   * Computes the SHA256 file hash of a buffer.
   */
  computeSHA256(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Computes an Average Perceptual Image Hash (aHash) using Sharp.
   * Grayscales the image, resizes it to an 8x8 grid, and evaluates pixel brightness against the mean.
   */
  async computePHash(buffer: Buffer): Promise<string> {
    try {
      const raw = await sharp(buffer)
        .resize(8, 8, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer();

      let sum = 0;
      for (let i = 0; i < 64; i++) {
        sum += raw[i];
      }
      const average = sum / 64;

      let binary = "";
      for (let i = 0; i < 64; i++) {
        binary += raw[i] >= average ? "1" : "0";
      }

      // Convert 64-bit binary to 16 hex characters
      let hex = "";
      for (let i = 0; i < 64; i += 4) {
        const chunk = binary.substring(i, i + 4);
        hex += parseInt(chunk, 2).toString(16);
      }

      return hex;
    } catch (err: any) {
      console.error("[DuplicateDetection] Failed to compute pHash:", err.message);
      return "";
    }
  }

  /**
   * Calculates the Hamming distance between two hex perceptual hashes.
   */
  getHammingDistance(hash1: string, hash2: string): number {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) {
      return 99; // Non-matching lengths or empty inputs represent a mismatch
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      const val1 = parseInt(hash1[i], 16);
      const val2 = parseInt(hash2[i], 16);
      let xor = val1 ^ val2;
      while (xor > 0) {
        if (xor & 1) {
          distance++;
        }
        xor >>= 1;
      }
    }
    return distance;
  }

  /**
   * Checks an uploaded file buffer against the database for exact or near visual duplicates.
   */
  async checkDuplicates(
    userId: string,
    buffer: Buffer,
    originalFilename: string
  ): Promise<DuplicateCheckResult> {
    const { MediaAsset } = require("../models");

    const sha256 = this.computeSHA256(buffer);
    const pHash = await this.computePHash(buffer);

    const matches: DuplicateMatch[] = [];

    // 1. Check for exact file hash duplicates across the user's library
    const exactMatches = await MediaAsset.find({
      user: userId,
      fileHash: sha256,
      del_flag: 0,
    });

    for (const match of exactMatches) {
      matches.push({
        mediaId: match._id.toString(),
        originalFilename: match.originalFilename,
        urls: match.urls,
        matchType: "exact",
        distance: 0,
      });
    }

    // 2. If no exact matches, run perceptual analysis to find near-duplicates (resized, compressed, converted)
    if (matches.length === 0 && pHash) {
      // Find all image type assets for this user that have a perceptual hash
      const assets = await MediaAsset.find({
        user: userId,
        type: "image",
        pHash: { $exists: true, $ne: null },
        del_flag: 0,
      });

      for (const asset of assets) {
        const distance = this.getHammingDistance(pHash, asset.pHash);
        // Distance <= 8 suggests extremely similar layout (near-duplicate)
        if (distance <= 8) {
          matches.push({
            mediaId: asset._id.toString(),
            originalFilename: asset.originalFilename,
            urls: asset.urls,
            matchType: "near",
            distance,
          });
        }
      }

      // Sort closest matches first
      matches.sort((a, b) => a.distance - b.distance);
    }

    return {
      isDuplicate: matches.length > 0,
      sha256,
      pHash,
      matches,
    };
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();
