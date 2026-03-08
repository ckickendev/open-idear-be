const mongoose = require("mongoose");

const { Schema } = mongoose;
const userSchema = new Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    username: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    avatar: { type: String },
    background: { type: String },
    bio: { type: String, trim: true },
    role: {
      type: Number,
      default: 0,
    },
    followers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
      default: []
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    activate: { type: Boolean, default: false },
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

module.exports = mongoose.model("user", userSchema);
