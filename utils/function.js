const crypto = require("crypto");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const randomAvatars = [
  "cat.png", "dog.png", "dolphin.png", "elephant.png", "fish.png",
  "hippo.png", "lion.png", "monkey.png", "pengiun.png", "shark.png",
  "snake.png", "tiger.png",
];

const makeRandomString = (length) => {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
};

const makeRandomNumber = (length) => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += crypto.randomInt(0, 10).toString();
  }
  return result;
};

const makeRandomAvatar = () => {
  const randomIndex = crypto.randomInt(0, randomAvatars.length);
  return `${BACKEND_URL}/icon/profile/${randomAvatars[randomIndex]}`;
};

// const slugify = (str) => {
//   str = str.replace(/^\s+|\s+$/g, ''); // trim leading/trailing white space
//   str = str.toLowerCase(); // convert string to lowercase
//   str = str.replace(/[^a-z0-9 -]/g, '') // remove any non-alphanumeric characters
//            .replace(/\s+/g, '-') // replace spaces with hyphens
//            .replace(/-+/g, '-'); // remove consecutive hyphens
//   return str;
// };

module.exports = { makeRandomString, makeRandomNumber, makeRandomAvatar };
