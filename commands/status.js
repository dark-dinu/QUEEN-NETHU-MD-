const { downloadMediaMessage } = require("@whiskeysockets/baileys");

// Bot Session Settings & Memory Cache
global.statusSettings = global.statusSettings || new Map();
global.statusCache = global.statusCache || new Map();
global.statusHookedSockets = global.statusHookedSockets || new WeakSet();
global.activeSockets = global.activeSockets || new Set();

function getBotPhone(sock) {
  const userJid = sock.user?.id || "";
  return userJid.split(":")[0].replace(/[^0-9]/g, "");
}

// Default Settings: Always ON
function getSettings(botPhone) {
  if (!global.statusSettings.has(botPhone)) {
    global.statusSettings.set(botPhone, {
      seen: true,
      react: true,
      emoji: "🥰"
    });
  }
  return global.statusSettings.get(botPhone);
}

function isBotOwner(sock, msg, from) {
  const botPhone = getBotPhone(sock);
  const senderJid = msg.key.fromMe
    ? botPhone
    : (msg.key.participant || msg.participant || from || "");
  const senderPhone = String(senderJid).split("@")[0].split(":")[0].replace(/[^0-9]/g, "");

  const devNumbers = ["94719845166", botPhone];
  return msg.key.fromMe || senderPhone === botPhone || devNumbers.includes(senderPhone);
}

// 🎯 Status Saver Keywords (Sinhala & English Triggers)
const STATUS_SAVE_TRIGGERS = [
  "save", "saveme", "oni", "onii", "one", "ona", "onee",
  "ewanna", "ewapanko", "ewapan", "ewahan", "evanna", "evapan",
  "dapan", "dapanko", "dpm", "danna", "dannako", "dapam", "diyam", "diyanko", "deepan",
  "send", "sendme", "give", "giveme", "plz", "pls", "bro",
  "ඕනි", "ඕනී", "ඕන", "ඕනෙ", "ඕනේ", "ඔනි",
  "එවන්න", "එවන්නකො", "එවපන්", "එවපන්කො", "එවහන්", "එවහං",
  "දාන්න", "දාන්නකො", "දාපන්", "දාපන්කො", "දාපං", "දීපන්", "දීපන්කො", "දීපං", "දෙන්න", "දෙන්නකො"
];

// Low-latency Background Watcher (Seen + Relay React + Reply Saver)
function attachStatusWatcher(sock) {
  if (!sock || global.statusHookedSockets.has(sock)) return;
  global.statusHookedSockets.add(sock);
  global.activeSockets.add(sock);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const m of messages) {
      if (!m?.message) continue;

      const from = m.key.remoteJid;

      // -------------------------------------------------------------
      // 🌟 1. STATUS BROADCAST (Auto Seen & Auto React)
      // -------------------------------------------------------------
      if (from === "status@broadcast") {
        const botPhone = getBotPhone(sock);
        const settings = getSettings(botPhone);

        // Cache Status Message
        if (m.key.id) {
          global.statusCache.set(m.key.id, m);
          if (global.statusCache.size > 3000) {
            const firstKey = global.statusCache.keys().next().value;
            global.statusCache.delete(firstKey);
          }
        }

        // 1. Auto Seen
        if (settings.seen) {
          await sock.readMessages([m.key]).catch(() => {});
        }

        // 2. Auto React (Direct WhatsApp Relay Node Protocol)
        if (settings.react && settings.emoji && !m.key.fromMe) {
          const participant = m.key.participant || m.participant;
          if (participant) {
            try {
              const userClean = participant.split(":")[0].split("@")[0] + "@s.whatsapp.net";
              const botClean = sock.user?.id ? sock.user.id.split(":")[0].split("@")[0] + "@s.whatsapp.net" : null;

              const reactionPayload = {
                reactionMessage: {
                  key: {
                    remoteJid: "status@broadcast",
                    id: m.key.id,
                    participant: participant,
                    fromMe: false
                  },
                  text: settings.emoji,
                  senderTimestampMs: Date.now()
                }
              };

              await sock.relayMessage(
                "status@broadcast",
                reactionPayload,
                {
                  messageId: m.key.id,
                  statusJidList: botClean ? [participant, userClean, botClean] : [participant, userClean]
                }
              );
            } catch (_) {
              try {
                await sock.sendMessage(
                  "status@broadcast",
                  {
                    react: {
                      text: settings.emoji,
                      key: {
                        remoteJid: "status@broadcast",
                        id: m.key.id,
                        participant: participant
                      }
                    }
                  },
                  { statusJidList: [participant] }
                );
              } catch (_) {}
            }
          }
        }
      }

      // -------------------------------------------------------------
      // 📥 2. STATUS REPLY SAVE ENGINE
      // -------------------------------------------------------------
      const contextInfo =
        m.message?.extendedTextMessage?.contextInfo ||
        m.message?.imageMessage?.contextInfo ||
        m.message?.videoMessage?.contextInfo;

      if (contextInfo?.remoteJid === "status@broadcast") {
        const textBody = (
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text ||
          ""
        ).trim().toLowerCase();

        const isTrigger = STATUS_SAVE_TRIGGERS.some(
          (t) => textBody === t || textBody.startsWith(t + " ") || textBody.endsWith(" " + t)
        );

        if (isTrigger) {
          const quotedStanzaId = contextInfo.stanzaId;
          const cachedMsg = global.statusCache.get(quotedStanzaId) || (contextInfo.quotedMessage ? {
            key: {
              remoteJid: "status@broadcast",
              id: quotedStanzaId,
              participant: contextInfo.participant
            },
            message: contextInfo.quotedMessage
          } : null);

          if (cachedMsg) {
            await deliverStatusMedia(sock, m, from, cachedMsg);
          }
        }
      }
    }
  });
}

// Auto Hook Background Monitor
setInterval(() => {
  if (global.activeSockets) {
    for (const s of global.activeSockets.values()) {
      attachStatusWatcher(s);
    }
  }
}, 3000);

// Status Media Sender Helper
async function deliverStatusMedia(sock, msg, from, targetStatusMsg) {
  try {
    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});

    let statusObj = targetStatusMsg.message;
    if (statusObj.ephemeralMessage) statusObj = statusObj.ephemeralMessage.message;
    if (statusObj.viewOnceMessage) statusObj = statusObj.viewOnceMessage.message;
    if (statusObj.viewOnceMessageV2) statusObj = statusObj.viewOnceMessageV2.message;

    const isImage = Boolean(statusObj.imageMessage);
    const isVideo = Boolean(statusObj.videoMessage);
    const isAudio = Boolean(statusObj.audioMessage);

    const captionHeader = 
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 𝐒𝐓𝐀𝐓𝐔𝐒 📥*
> ━━━━━━━━━━━━━━━━`;

    if (isImage || isVideo || isAudio) {
      const buffer = await downloadMediaMessage(
        targetStatusMsg,
        "buffer",
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      if (!buffer || buffer.length === 0) throw new Error("Empty media buffer");

      if (isImage) {
        const cap = statusObj.imageMessage.caption 
          ? `${captionHeader}\n📝 *Caption:* ${statusObj.imageMessage.caption}` 
          : captionHeader;
        await sock.sendMessage(from, { image: buffer, caption: cap }, { quoted: msg });
      } else if (isVideo) {
        const cap = statusObj.videoMessage.caption 
          ? `${captionHeader}\n📝 *Caption:* ${statusObj.videoMessage.caption}` 
          : captionHeader;
        await sock.sendMessage(from, { video: buffer, caption: cap, mimetype: "video/mp4" }, { quoted: msg });
      } else if (isAudio) {
        await sock.sendMessage(from, {
          audio: buffer,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true
        }, { quoted: msg });
      }
    } else {
      const textStatus = statusObj.conversation || statusObj.extendedTextMessage?.text || "";
      await sock.sendMessage(from, {
        text: `${captionHeader}\n\n📝 *Content:*\n${textStatus}`
      }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
    return true;
  } catch (err) {
    console.error("[STATUS DELIVER ERROR]:", err.message);
    await sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
    return false;
  }
}

module.exports = {
  name: "status",
  aliases: ["stseen", "stract", "setst", "statussave", "ssave"],
  description: "Status automation controls and interactive status saver",

  execute: async (sock, msg, from, args) => {
    attachStatusWatcher(sock);

    const botPhone = getBotPhone(sock);
    const settings = getSettings(botPhone);

    const rawText =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";
    const firstWord = rawText.trim().split(" ")[0].slice(1).toLowerCase();

    // 1. .setst react <emoji>
    if (firstWord === "setst") {
      if (!isBotOwner(sock, msg, from)) {
        return await sock.sendMessage(from, { text: "⛔ *Access denied!* Owner only." }, { quoted: msg });
      }

      const subAction = args[0]?.toLowerCase();
      const newEmoji = (subAction === "react" ? args[1] : args[0])?.trim();

      if (!newEmoji) {
        return await sock.sendMessage(from, { text: "⚠️ *Usage:* `.setst react 🥰`" }, { quoted: msg });
      }

      settings.emoji = newEmoji;
      global.statusSettings.set(botPhone, settings);

      await sock.sendMessage(from, { react: { text: newEmoji, key: msg.key } }).catch(() => {});
      return await sock.sendMessage(from, {
        text: `> ✦ *Status React Emoji:* ${newEmoji}`
      }, { quoted: msg });
    }

    // 2. .stseen on / off
    if (firstWord === "stseen") {
      if (!isBotOwner(sock, msg, from)) {
        return await sock.sendMessage(from, { text: "⛔ *Access denied!* Owner only." }, { quoted: msg });
      }

      const state = args[0]?.toLowerCase();
      if (state !== "on" && state !== "off") {
        return await sock.sendMessage(from, { text: "⚠️ *Usage:* `.stseen on` / `off`" }, { quoted: msg });
      }

      const isTurnOn = state === "on";
      settings.seen = isTurnOn;
      global.statusSettings.set(botPhone, settings);

      return await sock.sendMessage(from, {
        text: `> ✦ *Auto Seen:* ${isTurnOn ? "🟢 ON" : "🔴 OFF"}`
      }, { quoted: msg });
    }

    // 3. .stract on / off
    if (firstWord === "stract") {
      if (!isBotOwner(sock, msg, from)) {
        return await sock.sendMessage(from, { text: "⛔ *Access denied!* Owner only." }, { quoted: msg });
      }

      const state = args[0]?.toLowerCase();
      if (state !== "on" && state !== "off") {
        return await sock.sendMessage(from, { text: "⚠️ *Usage:* `.stract on` / `off`" }, { quoted: msg });
      }

      const isTurnOn = state === "on";
      settings.react = isTurnOn;
      global.statusSettings.set(botPhone, settings);

      return await sock.sendMessage(from, {
        text: `> ✦ *Auto React:* ${isTurnOn ? "🟢 ON" : "🔴 OFF"} (${settings.emoji})`
      }, { quoted: msg });
    }

    // 4. Status Reply with .status or .statussave
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo;

    const quoted = contextInfo?.quotedMessage;
    const quotedId = contextInfo?.stanzaId;

    if (quoted) {
      const cached = global.statusCache.get(quotedId) || {
        key: {
          remoteJid: "status@broadcast",
          id: quotedId,
          participant: contextInfo.participant
        },
        message: quoted
      };
      return await deliverStatusMedia(sock, msg, from, cached);
    }

    // Default Compact Status Dashboard
    return await sock.sendMessage(from, {
      text:
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 𝐒𝐓𝐀𝐓𝐔𝐒*
> ━━━━━━━━━━━━━━━━
> 👁️ *Seen:* ${settings.seen ? "🟢 ON" : "🔴 OFF"}
> 💖 *React:* ${settings.react ? "🟢 ON" : "🔴 OFF"} (${settings.emoji})
> ━━━━━━━━━━━━━━━━
> ⚙️ \`.stseen on\` / \`off\`
> ⚙️ \`.stract on\` / \`off\`
> ⚙️ \`.setst react <emoji>\`
> ━━━━━━━━━━━━━━━━
> _Reply status with *save*, *send*, or *oni*_`
    }, { quoted: msg });
  }
};
