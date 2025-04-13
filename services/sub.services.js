const { Service } = require("../core");
const { Sub } = require("../models");

class SubService extends Service {
    async getAll() {
        const subs = await Sub.find({});
        return subs;
    }
}

module.exports = new SubService();
