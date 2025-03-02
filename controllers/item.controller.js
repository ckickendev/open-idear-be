const express = require("express");
const { Controller } = require("../core");
const { AdminMiddleware } = require("../middlewares/auth.middleware");
const { itemService } = require("../services");

class ItemController extends Controller {
  _rootPath = "/item";
  _router = express.Router();
  constructor() {
    super();
    this.initController();
  }

  getAllItems = async (req, res, next) => {
    try {
      const allItem = await itemService.getAllItems();
      res.status(200).json({
        allItems: allItem,
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  };

  findItemById = async (req, res, next) => {
    try {
      const item = await itemService.findItemById(req.params.id);
      res.status(200).json({
        item: item,
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  };

  getItemByItemNameAPI = async (req, res, next) => {
    try {
      const item = await itemService.getItemByItemNameAPI(req.params.nameAPI);
      res.status(200).json({
        item: item,
      });
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  };

  addNewItem = async (req, res, next) => {
    const newItem = req.body.newItem;
    try {
      const newItemData = await itemService.addNewItem(newItem);
      res.status(200).json({
        message: "Add new item !",
        newItemData: newItemData,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };

  deleteItem = async (req, res, next) => {
    const id = req.body.idItem;
    try {
      const dataDelete = await itemService.deleteItem(id);
      res.status(200).json({
        message: "Delete item success!",
        dataDelete: dataDelete,
      });
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  };

  editItem = async (req, res, nex) => {
    try {
      const editData = req.body.data.editData;
      const responseData = await itemService.editItem(editData);
      res.status(200).json({
        message: "Edit item success!",
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
      this.getAllItems
    );
    this._router.get(
      `${this._rootPath}/find/:id`,
      this.findItemById
    );
    this._router.get(
      `${this._rootPath}/getItemByItemNameAPI/:nameAPI`,
      this.getItemByItemNameAPI
    );
    this._router.post(
      `${this._rootPath}/add`,
      AdminMiddleware,
      this.addNewItem
    );
    this._router.delete(
      `${this._rootPath}/delete`,
      AdminMiddleware,
      this.deleteItem
    );
    this._router.patch(
      `${this._rootPath}/edit`,
      AdminMiddleware,
      this.editItem
    );
  }
}

module.exports = ItemController;
