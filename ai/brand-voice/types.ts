export interface BrandVoiceProfile {
  _id?: string;
  name: string;
  tone: string;
  emoji: "none" | "low" | "medium" | "high";
  language: string;
  codeStyle: string;
  isDefault?: boolean;
}

export const DEFAULT_BRAND_VOICE: BrandVoiceProfile = {
  name: "OpenIdear Default",
  tone: "Friendly Senior Engineer",
  emoji: "low",
  language: "Vietnamese",
  codeStyle: "TypeScript",
  isDefault: true,
};
