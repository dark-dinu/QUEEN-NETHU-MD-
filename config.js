module.exports = {
  // Bot Settings
  BOT_NAME: process.env.BOT_NAME || "QUEEN NETHU MD",
  PREFIX: process.env.PREFIX || ".",
  WORK_TYPE: process.env.WORK_TYPE || "public", // "public" හෝ "private"

  // Owner Details
  OWNER_NAME: process.env.OWNER_NAME || "Dinidu Heshan",
  OWNER_NUMBER: process.env.OWNER_NUMBER || "94719845166",

  // Database Connection
  MONGO_URI: process.env.MONGO_URI || "mongodb+srv://diniduheshan40_db_user:nziBElbMabqIwsol@cluster0.5gazebm.mongodb.net/?appName=Cluster0",

  // Web Pairing Port (Render / Koyeb / Localhost)
  PORT: process.env.PORT || 3000,

  // Fast Engine & Automation Flags
  AUTO_READ_STATUS: process.env.AUTO_READ_STATUS || "true",
  ALWAYS_ONLINE: process.env.ALWAYS_ONLINE || "true"
};
