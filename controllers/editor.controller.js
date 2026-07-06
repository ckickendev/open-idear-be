const express = require("express");
const { Controller } = require("../core");
const asyncHandler = require("../utils/asyncHandler");
const { AuthMiddleware } = require("../middlewares/auth.middleware");
const { EditingWorkflow } = require("../ai");

// =============================================================================
//  EDITOR CONTROLLER
//  controllers/editor.controller.js
//
//  API controller exposing inline editor action endpoints.
//  Protected by AuthMiddleware.
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
   * Triggers an editor copilot action (continue, improve, example, review)
   * with the given context parameters.
   */
  handleAction = asyncHandler(async (req, res) => {
    const { action, context } = req.body;

    if (!action || !action.trim()) {
      return res.status(400).json({ error: "action (actionId) is required" });
    }

    const workflow = new EditingWorkflow();

    // Execute the workflow, transferring context parameters into the builder
    const result = await workflow.execute(
      { actionId: action.trim(), payload: context },
      { context }
    );

    res.json({
      status: "success",
      data: result,
    });
  });

  initController = () => {
    this._router.post(`${this._rootPath}/action`, AuthMiddleware, this.handleAction);
  };
}

module.exports = EditorController;
