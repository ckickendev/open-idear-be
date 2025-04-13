const { Service } = require("../core");
const { Notification } = require("../models");

class NotificationService extends Service {
    async getAll() {
        const notis = await Notification.find({});
        return notis;
    }
}

module.exports = new NotificationService();
