const { updateSetting } = require("../database/mongo");
const config = require("../config");

module.exports = {
  command: "setting",
  aliases: ["settings", "config"],
  execute: async ({ sock, from, args, settings }) => {
    const action = args[0]?.toLowerCase();
    const value = args[1]?.toLowerCase();

    if (!action) {
      const menu = `👑 *${config.BOT_NAME} - SYSTEM SETTINGS*\n\n` +
        `• *Auto Status Seen:* ${settings.autoStatusSeen ? "🟢 ON" : "🔴 OFF"}\n` +
        `• *Auto Status React:* ${settings.autoStatusReact ? "🟢 ON" : "🔴 OFF"}\n` +
        `• *Prefix:* \`${settings.prefix}\`\n` +
        `• *Reactions:* ${settings.reactions.join(" ")}\n\n` +
        `*Commands:*\n` +
        `▫️ \`.setting autostatus on/off\`\n` +
        `▫️ \`.setting autoreact on/off\`\n` +
        `▫️ \`.setting prefix <symbol>\``;

      return await sock.sendMessage(from, { text: menu });
    }

    if (action === "autostatus") {
      const state = value === "on";
      await updateSetting("autoStatusSeen", state);
      return await sock.sendMessage(from, { text: `✅ Auto Status Seen: *${state ? "ENABLED" : "DISABLED"}*` });
    }

    if (action === "autoreact") {
      const state = value === "on";
      await updateSetting("autoStatusReact", state);
      return await sock.sendMessage(from, { text: `✅ Auto Status React: *${state ? "ENABLED" : "DISABLED"}*` });
    }

    if (action === "prefix" && args[1]) {
      await updateSetting("prefix", args[1]);
      return await sock.sendMessage(from, { text: `✅ Prefix set to: *${args[1]}*` });
    }
  }
};
