import mongoose from "mongoose";
import { type BrandVoiceProfile, DEFAULT_BRAND_VOICE } from "./types";
const BrandVoiceModel = require("../../models/brandVoice.schema");

export class BrandVoiceService {
  /**
   * Formats a Brand Voice profile into system prompt instructions.
   * Every agent automatically includes this formatted string.
   */
  public static formatPromptInstructions(bv?: Partial<BrandVoiceProfile>): string {
    const profile = { ...DEFAULT_BRAND_VOICE, ...bv };
    return `
--- BRAND VOICE CONSTRAINTS ---
Writing Tone: ${profile.tone}
Emoji Frequency: ${profile.emoji}
Primary Language: ${profile.language}
Code Snippet Preference: ${profile.codeStyle}
--------------------------------
`.trim();
  }

  /**
   * Fetches all brand voice profiles for a user + default system profile.
   */
  public async getProfiles(userId?: string): Promise<BrandVoiceProfile[]> {
    const profiles: BrandVoiceProfile[] = [DEFAULT_BRAND_VOICE];

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      try {
        const userDocs = await BrandVoiceModel.find({ user: userId }).sort({ createdAt: -1 });
        const userProfiles = userDocs.map((doc: any) => ({
          _id: doc._id.toString(),
          name: doc.name,
          tone: doc.tone,
          emoji: doc.emoji,
          language: doc.language,
          codeStyle: doc.codeStyle,
          isDefault: doc.isDefault,
        }));
        return [...profiles, ...userProfiles];
      } catch (err: any) {
        console.warn(`[BrandVoiceService] Error fetching user profiles: ${err.message}`);
      }
    }

    return profiles;
  }

  /**
   * Creates a new Brand Voice profile for a user.
   */
  public async createProfile(userId: string, data: Partial<BrandVoiceProfile>): Promise<BrandVoiceProfile> {
    const _id = new mongoose.Types.ObjectId();
    const doc = await BrandVoiceModel.create({
      _id,
      user: userId,
      name: data.name || "Custom Brand Voice",
      tone: data.tone || "Friendly Senior Engineer",
      emoji: data.emoji || "low",
      language: data.language || "Vietnamese",
      codeStyle: data.codeStyle || "TypeScript",
      isDefault: data.isDefault || false,
    });

    return {
      _id: doc._id.toString(),
      name: doc.name,
      tone: doc.tone,
      emoji: doc.emoji,
      language: doc.language,
      codeStyle: doc.codeStyle,
      isDefault: doc.isDefault,
    };
  }

  /**
   * Deletes a user Brand Voice profile.
   */
  public async deleteProfile(userId: string, profileId: string): Promise<boolean> {
    const res = await BrandVoiceModel.deleteOne({ _id: profileId, user: userId });
    return res.deletedCount > 0;
  }
}
