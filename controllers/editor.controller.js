const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { EditingWorkflow, aiFeatureRegistry } = require("../ai");

// =============================================================================
//  EDITOR CONTROLLER
//  controllers/editor.controller.js
//
//  API controller exposing inline editor action endpoints.
//  Protected by AuthMiddleware.
//  Uses centralized aiFeatureRegistry for typed validation and telemetry.
// =============================================================================

class EditorController extends Controller {
  _rootPath = "/api/editor";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  /**
   * POST /api/editor/action
   * Triggers an editor copilot action (continue, improve, example, review, rewrite, etc.)
   * with the given context parameters.
   */
  handleAction = asyncHandler(async (req, res) => {
    const { action, context } = req.body;

    if (!action || !action.trim()) {
      return res.status(400).json({ error: "action (actionId) is required" });
    }

    // Validate and resolve action against centralized aiFeatureRegistry
    let feature;
    try {
      feature = aiFeatureRegistry.resolve(action.trim());
    } catch (err) {
      return res.status(400).json({
        error: `Invalid editor action "${action}". Must be a registered AI feature.`,
        registeredActions: aiFeatureRegistry.getByCategory("editing").map((f) => f.id),
      });
    }

    const workflow = new EditingWorkflow();

    // Execute the workflow, transferring context and feature telemetry metadata
    const result = await workflow.execute(
      { actionId: feature.id, payload: context },
      {
        context: {
          ...(context || {}),
          featureId: feature.id,
          telemetryKey: feature.telemetryKey,
        },
      }
    );

    res.json({
      status: "success",
      feature: {
        id: feature.id,
        name: feature.name,
        category: feature.category,
        telemetryKey: feature.telemetryKey,
        estimatedCreditCost: feature.estimatedCreditCost,
      },
      data: result,
    });
  });


  initController = () => {
    this._router.post(`${this._rootPath}/action`, AuthMiddleware, this.handleAction);
  };
}

module.exports = EditorController;
