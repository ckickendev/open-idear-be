const {
  UserController,
  AuthController,
  ChampionController,
  ItemController,
  TraitController,
} = require("./controllers");
const AppServer = require("./functions/appServer");

const app = new AppServer([
  new UserController(),
  new AuthController(),
  new ChampionController(),
  new ItemController(),
  new TraitController
]);

app.startListening();
