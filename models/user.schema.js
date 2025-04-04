const mongoose = require("mongoose");
const uuid = require("node-uuid");

const { Schema } = mongoose;
const userSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String },
    bio: { type: String },
    role: {
      type: Number,
      default: 0,
    },
    email: String,
    activate: Boolean,
    activate_code: String,
    token_reset_pass: String,
    token_reset_pass_expired: Date,
    del_flag: {
      type: Number,
      default: 0
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("users", userSchema);
