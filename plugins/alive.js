const config = require("../config");

module.exports = {
  command: "alive",
  aliases: ["bot", "info"],
  execute: async ({ sock, from }) => {
    const aliveText = `👑 *${config.BOT_NAME} IS RUNNING*\n\n` +
      `• *Device:* ${config.DEVICE_NAME}\n` +
      `• *Status Seen & React:* 100% Active\n` +
      `• *Database:* Synced`;

    await sock.sendMessage(from, { text: aliveText });
  }
};
