const { aiVisionService } = require("../ai");
const { Service } = require("../core");

class AIAnalysisService extends Service {
  /**
   * Retrieves image analysis using the swappable AIVisionService.
   */
  async analyzeImage(imageUrl, mimeType) {
    if (!imageUrl) {
      throw new Error("Cannot analyze image: imageUrl is required.");
    }

    const result = await aiVisionService.analyze(imageUrl);

    return {
      altText: result.alt,
      description: result.description,
      tags: result.tags,
      confidence: 1.0,
      model: aiVisionService.getActiveProvider().id,
    };
  }
}

module.exports = new AIAnalysisService();
