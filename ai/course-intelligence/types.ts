export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  status: "ready" | "processing" | "failed";
  language: string;
  text: string;
  segments: TranscriptSegment[];
  provider: string;
  duration?: number;
}

export interface SuggestedChapter {
  timestamp: string; // e.g. "00:00"
  seconds: number;
  title: string;
  summary?: string;
}

export interface CourseIntelligenceAnalysis {
  summary: {
    short: string;
    detailed: string;
  };
  keyPoints: string[];
  learningObjectives: string[];
  concepts: string[];
  keywords: string[];
  suggestedChapters: SuggestedChapter[];
}

export interface ITranscriptProvider {
  transcribe(input: {
    mediaId?: string;
    cloudflareId?: string;
    url?: string;
    title: string;
    duration?: number;
    description?: string;
  }): Promise<TranscriptResult>;
}
