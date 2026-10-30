const mongoose = require("mongoose");
const config = require("../config");

const SettingsSchema = new mongoose.Schema({
  botId: { type: String, default: "nethu_bot", unique: true },
  prefix: { type: String, default: config.PREFIX },
  autoStatusSeen: { type: Boolean, default: config.AUTO_STATUS_SEEN },
  autoStatusReact: { type: Boolean, default: config.AUTO_STATUS_REACT },
  workType: { type: String, default: "public" },
  reactions: { type: [String], default: config.STATUS_REACTIONS }
});

const Settings = mongoose.model("Settings", SettingsSchema);

async function connectDB() {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log("✅ [DB] MongoDB Connected Successfully.");
  } catch (err) {
    console.error("❌ [DB] MongoDB Connection Error:", err.message);
  }
}

async function getSettings() {
  let doc = await Settings.findOne({ botId: "nethu_bot" });
  if (!doc) {
    doc = await Settings.create({ botId: "nethu_bot" });
  }
  return doc;
}

async function updateSetting(key, value) {
  return await Settings.findOneAndUpdate(
    { botId: "nethu_bot" },
    { [key]: value },
    { new: true, upsert: true }
  );
}

module.exports = { connectDB, getSettings, updateSetting };
