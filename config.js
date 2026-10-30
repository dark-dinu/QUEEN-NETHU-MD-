module.exports = {
  // Database
  MONGO_URI: process.env.MONGO_URI || "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0",

  // Pairing Number (Terminal prompt නැති නිසා direct මෙතැනට දෙන්න)
  PHONE_NUMBER: process.env.PHONE_NUMBER || "94719845166",

  // Port for Render Web Service
  PORT: process.env.PORT || 10000,

  // Identity & Device Tag
  BOT_NAME: "QUEEN NETHU MD",
  DEVICE_NAME: "NETH-UXMD",
  BROWSER: ["NETH-UXMD (Chrome)", "Chrome", "130.0.6723.70"],
  
  // Default Settings
  PREFIX: ".",
  OWNER_NUMBER: "94719845166",
  AUTO_STATUS_SEEN: true,
  AUTO_STATUS_REACT: true,
  STATUS_REACTIONS: ["❤️", "💖", "🥰", "🔥", "✨", "👑"]
};
