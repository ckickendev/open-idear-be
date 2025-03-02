const { Service } = require("../core");
const { Champion, Trait } = require("../models");
const mongoose = require("mongoose");

class ChampionService extends Service {
  getAllChampion = async () => {
    const champions = await Champion.find({ del_flag: 0 });
    return champions.map((championElement) => {
      return {
        _id: championElement._id,
        avatar: championElement.avatar,
        bgimage: championElement.bgimage,
        name: championElement.name,
        name_api: championElement.name_api,
        cost: championElement.cost,
        skill: championElement.skill,
      };
    });
  };

  getChampionById = async (id) => {
    return await Champion.find({ _id: id, del_flag: 0 });
  };

  getListTraisByChampionId = async (id) => {
    const listTrait = await Trait.find({ champions: id });
    return listTrait;
  };

  getChampionByNameApi = async (name_api) => {
    const champion = await Champion.find({ name_api: name_api, del_flag: 0 });
    return champion;
  };

  getListTraitsByNameAPI = async(name_api) => {
    const champion = await Champion.find({ name_api: name_api, del_flag: 0 });
    const championRs = await Trait.find({ champions: champion[0]._id })
    return championRs;
  }

  addNewChampion = async (data) => {
    const newChampion = new Champion({
      _id: new mongoose.Types.ObjectId(),
      avatar: data.avatar,
      bgimage: data.bgimage,
      name: data.name,
      name_api: data.name_api,
      cost: data.cost,
      skill: data.skill,
      traits: [],
    });
    newChampion.save();
    return newChampion;
  };

  deleteChampion = async (id) => {
    await Champion.updateOne({ _id: id }, { del_flag: 1 });
    const returnChampion = await Champion.findById({ _id: id });
    return returnChampion;
  };

  editChampion = async (data) => {
    const { avatar, bgimage, name, name_api, skill, cost } = data;
    const findById = { _id: data._id };
    const updateData = { avatar, bgimage, name, name_api, skill, cost };
    const responseData = await Champion.updateOne(findById, updateData);
    return responseData;
  };
}

module.exports = new ChampionService();
