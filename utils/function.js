const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const randomAvatar = [
  `${BACKEND_URL}/icon/profile/cat.png`,
  `${BACKEND_URL}/icon/profile/dog.png`,
  `${BACKEND_URL}/icon/profile/dolphin.png`,
  `${BACKEND_URL}/icon/profile/elephant.png`,
  `${BACKEND_URL}/icon/profile/fish.png`,
  `${BACKEND_URL}/icon/profile/hippo.png`,
  `${BACKEND_URL}/icon/profile/lion.png`,
  `${BACKEND_URL}/icon/profile/monkey.png`,
  `${BACKEND_URL}/icon/profile/pengiun.png`,
  `${BACKEND_URL}/icon/profile/shark.png`,
  `${BACKEND_URL}/icon/profile/snake.png`,
  `${BACKEND_URL}/icon/profile/tiger.png`,
];

const makeRandomString = (length) => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
};

const makeRandomNumber = (length) => {
  let result = "";
  const characters = "0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
};

const makeRandomAvatar = () => {
  const randomNumber = randomIntFromInterval(0, randomAvatar.length - 1);
  return randomAvatar[randomNumber];
};

function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const slugify = (str) => {
  str = str.replace(/^\s+|\s+$/g, ''); // trim leading/trailing white space
  str = str.toLowerCase(); // convert string to lowercase
  str = str.replace(/[^a-z0-9 -]/g, '') // remove any non-alphanumeric characters
           .replace(/\s+/g, '-') // replace spaces with hyphens
           .replace(/-+/g, '-'); // remove consecutive hyphens
  return str;
};

module.exports = { makeRandomString, makeRandomNumber, makeRandomAvatar, slugify };
