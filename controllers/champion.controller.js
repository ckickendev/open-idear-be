const express = require("express");
const { Controller } = require("../core");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const { championService } = require("../services");

class ChampionController extends Controller {
  _rootPath = "/champion";
  _router = express.Router();
  constructor() {
    super();
    this.initController();
  }

  getAllChampion = async (req, res, next) => {
    try {
      const allChampion = await championService.getAllChampion();
      res.status(200).json({
        allChampions: allChampion,
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  };

  getChampionById = async (req, res, next) => {
    try {
      const champion = await championService.getChampionById(req.params.championId);
      res.status(200).json({
        champion: champion[0],
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  };

  getListTraisByChampionId = async (req, res, next) => {
    try {
      const traits = await championService.getListTraisByChampionId(req.params.championId);
      res.status(200).json({
        traits: traits
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  }

  getChampionByNameApi = async (req, res, next) => {
    try {
      const champion = await championService.getChampionByNameApi(req.params.championNameApi);
      res.status(200).json({
        champion: champion
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  }

  getListTraitsByNameAPI = async(req, res, next) => {
    try {
      const traits = await championService.getListTraitsByNameAPI(req.params.championNameApi);
      res.status(200).json({
        traits: traits
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  }


  addNewChampion = async (req, res, next) => {
    const newChampion = req.body.newChampion;
    try {
      const newChampionData = await championService.addNewChampion(newChampion);
      res.status(200).json({
        message: "Add new champion !",
        newChampionData: newChampionData,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };

  deleteChampion = async (req, res, next) => {
    const id = req.body.idChampion;
    try {
      const dataDelete = await championService.deleteChampion(id);
      res.status(200).json({
        message: "Delete champion success!",
        dataDelete: dataDelete,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };

  editChampion = async (req, res, nex) => {
    try {
      const editData = req.body.data.editData;
      const responseData = await championService.editChampion(editData);
      res.status(200).json({
        message: "Edit champion success!",
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
      this.getAllChampion
    );
    this._router.get(
      `${this._rootPath}/find/:championId`,
      this.getChampionById
    );
    this._router.get(
      `${this._rootPath}/getListTraits/:championId`,
      this.getListTraisByChampionId
    );
    this._router.get(
      `${this._rootPath}/getChampionByNameApi/:championNameApi`,
      this.getChampionByNameApi
    );
    this._router.get(
      `${this._rootPath}/getListTraitsByNameAPI/:championNameApi`,
      this.getListTraitsByNameAPI
    );
    this._router.post(
      `${this._rootPath}/add`,
      AdminMiddleware,
      this.addNewChampion
    );
    this._router.delete(
      `${this._rootPath}/delete`,
      AdminMiddleware,
      this.deleteChampion
    );
    this._router.patch(
      `${this._rootPath}/edit`,
      AdminMiddleware,
      this.editChampion
    );
  }
}

module.exports = ChampionController;
