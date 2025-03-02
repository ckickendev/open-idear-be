const express = require("express");
const { Controller } = require("../core");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const { traitService } = require("../services");

class TraitController extends Controller {
  _rootPath = "/trait";
  _router = express.Router();
  constructor() {
    super();
    this.initController();
  }

  getAllTraits = async (req, res, next) => {
    try {
      const allTraits = await traitService.getAllTraits();
      res.status(200).json({
        allTraits: allTraits,
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  };

  getTraitById = async (req, res, next) => {
    try {
      const trait = await traitService.getTraitById(req.params.id);
      res.status(200).json({
        trait: trait,
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  };

  getTraitByNameAPI = async (req, res, next) => {
    try {
      const trait = await traitService.getTraitByNameAPI(req.params.name_api);
      res.status(200).json({
        trait: trait,
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  };

  addNewTrait = async (req, res, next) => {
    const newTrait = req.body.newTrait;
    try {
      const newTraitData = await traitService.addNewTrait(newTrait);
      res.status(200).json({
        message: "Add new trait !",
        newTraitData: newTraitData,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };

  deleteTrait = async (req, res, next) => {
    const id = req.body.idTrait;
    try {
      const dataDelete = await traitService.deleteTrait(id);
      res.status(200).json({
        message: "Delete trait success!",
        dataDelete: dataDelete,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };

  editTrait = async (req, res, next) => {
    try {
      const editData = req.body.data.editData;
      const responseData = await traitService.editTrait(editData);
      res.status(200).json({
        message: "Edit trait success!",
        responseData: responseData,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };

  editTraitChampion = async (req, res, next) => {
    try {
      const editData = req.body.data;
      console.log("edit", editData);
      const responseData = await traitService.editTraitChampion(editData);
      res.status(200).json({
        message: "Edit success!",
        responseData: responseData,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };

  initController() {
    this._router.get(
      `${this._rootPath}/get-all`,
      this.getAllTraits
    );
    this._router.get(
      `${this._rootPath}/find/:id`,
      this.getTraitById
    );
    this._router.get(
      `${this._rootPath}/getTraitByNameAPI/:name_api`,
      this.getTraitByNameAPI
    );
    this._router.post(
      `${this._rootPath}/add`,
      AdminMiddleware,
      this.addNewTrait
    );
    this._router.post(
      `${this._rootPath}/edit-trait-champion`,
      AdminMiddleware,
      this.editTraitChampion
    );
    this._router.delete(
      `${this._rootPath}/delete`,
      AdminMiddleware,
      this.deleteTrait
    );
    this._router.patch(
      `${this._rootPath}/edit`,
      AdminMiddleware,
      this.editTrait
    );
  }
}

module.exports = TraitController;
