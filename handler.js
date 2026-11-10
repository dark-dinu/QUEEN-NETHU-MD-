const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const config = require("./config");

// Commands Loader
const commands = new Map();
const commandsPath = path.join(__dirname, "commands");

// 🎯 Interactive Reply Sessions
const replySessions = new Map();

if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.name && cmd.execute) {
      commands.set(cmd.name.toLowerCase(), cmd);
    }
  }
}

function cleanJid(jid = "") {
  if (!jid) return "";
  return jid.split(":")[0].split("@")[0] + "@s.whatsapp.net";
}

function extractMessageContent(msg) {
  let m = msg.message;
  if (!m) return "";

  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ""
  );
}

function registerReply(from, sender, msgId, actions, timeoutMs = 120000) {
  const userClean = cleanJid(sender);
  const primaryKey = `${from}_${userClean}`;
  const fallbackKey = `${from}`;

  const cleanup = () => {
    replySessions.delete(primaryKey);
    replySessions.delete(fallbackKey);
  };

  const timer = setTimeout(cleanup, timeoutMs);
  const sessionData = { msgId, actions, timer, cleanup };

  replySessions.set(primaryKey, sessionData);
  replySessions.set(fallbackKey, sessionData);
}

// 🎯 Status Saver Keywords (Sinhala & Singlish)
const STATUS_SAVE_TRIGGERS = [
  "save", "oni", "ona", "ewanna", "ewapan", "dapan", "dpm", "danna", "dapam",
  "diyam", "evanna", "evapanko", "ewapanko", "send", "give", "deepan",
  "ඕනි", "ඕන", "ඕනෙ", "දෙන්න", "දාන්න", "එවන්න", "එවපන්", "දාපන්", "දීපන්", "දාපං"
];

/**
 * Main Message Dispatcher
 */
async function handleMessage(sock, msg) {
  try {
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    if (!from) return;

    // -------------------------------------------------------------
    // 🌟 1. STATUS AUTO-SEEN & AUTO-REACT (🥰)
    // -------------------------------------------------------------
    if (from === "status@broadcast") {
      // 1. Auto Seen (Mark as Read)
      await sock.readMessages([msg.key]).catch(() => {});

      // 2. Auto React with 🥰
      const participant = msg.key.participant || msg.participant;
      if (participant) {
        await sock.sendMessage(
          "status@broadcast",
          {
            react: {
              text: "🥰",
              key: msg.key
            }
          },
          { statusJidList: [participant] }
        ).catch(() => {});
      }
      return;
    }

    // Decryption message keys drop වීම වැළැක්වීම
    if (msg.message.senderKeyDistributionMessage || msg.message.protocolMessage) return;

    const rawSender = msg.key.participant || (msg.key.fromMe ? sock.user?.id : from);
    const sender = cleanJid(rawSender);
    const body = extractMessageContent(msg);
    const trimmedBody = body.trim().toLowerCase();

    // Context / Quoted Message Info
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo;

    const quotedMessage = contextInfo?.quotedMessage;

    // -------------------------------------------------------------
    // 📥 2. STATUS SAVE ENGINE (save, ewanna, දාන්න, දෙන්න, ඕනි...)
    // -------------------------------------------------------------
    const isStatusReply = contextInfo?.remoteJid === "status@broadcast";

    if (isStatusReply && quotedMessage) {
      const isSaveTrigger = STATUS_SAVE_TRIGGERS.some(
        (trigger) => trimmedBody === trigger || trimmedBody.startsWith(trigger + " ")
      );

      if (isSaveTrigger) {
        await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});

        try {
          const statusSender = contextInfo.participant || from;
          const cleanSenderNum = statusSender.split("@")[0].split(":")[0];

          const captionText =
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 𝐒𝐓𝐀𝐓𝐔𝐒 📥*
> ━━━━━━━━━━━━━━━━
> 👤 *Status From:* @${cleanSenderNum}
> ━━━━━━━━━━━━━━━━`;

          // Image Status Download & Send
          if (quotedMessage.imageMessage) {
            const buffer = await downloadMediaMessage(
              { message: quotedMessage, key: { id: contextInfo.stanzaId, remoteJid: "status@broadcast" } },
              "buffer",
              {},
              { reuploadRequest: sock.updateMediaMessage }
            );

            await sock.sendMessage(
              from,
              {
                image: buffer,
                caption: quotedMessage.imageMessage.caption ? `${captionText}\n\n📝 *Caption:* ${quotedMessage.imageMessage.caption}` : captionText,
                mentions: [statusSender]
              },
              { quoted: msg }
            );
          }
          // Video Status Download & Send
          else if (quotedMessage.videoMessage) {
            const buffer = await downloadMediaMessage(
              { message: quotedMessage, key: { id: contextInfo.stanzaId, remoteJid: "status@broadcast" } },
              "buffer",
              {},
              { reuploadRequest: sock.updateMediaMessage }
            );

            await sock.sendMessage(
              from,
              {
                video: buffer,
                caption: quotedMessage.videoMessage.caption ? `${captionText}\n\n📝 *Caption:* ${quotedMessage.videoMessage.caption}` : captionText,
                mimetype: "video/mp4",
                mentions: [statusSender]
              },
              { quoted: msg }
            );
          }
          // Text Status Send
          else if (quotedMessage.conversation || quotedMessage.extendedTextMessage?.text) {
            const textContent = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;
            await sock.sendMessage(
              from,
              {
                text: `${captionText}\n\n📝 *Content:*\n${textContent}`,
                mentions: [statusSender]
              },
              { quoted: msg }
            );
          }

          await sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
          return;
        } catch (err) {
          console.error("Status Save Error:", err.message);
          await sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
          return await sock.sendMessage(
            from,
            { text: `❌ *Status එක ලබා ගැනීම අසාර්ථක විය:* (${err.message})` },
            { quoted: msg }
          );
        }
      }
    }

    // -------------------------------------------------------------
    // 🎯 3. Interactive 1, 2, 3 Reply Handling
    // -------------------------------------------------------------
    const primaryKey = `${from}_${sender}`;
    const fallbackKey = `${from}`;
    const activeSession = replySessions.get(primaryKey) || replySessions.get(fallbackKey);

    if (activeSession && activeSession.actions[trimmedBody]) {
      clearTimeout(activeSession.timer);
      activeSession.cleanup();

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});
      try {
        await activeSession.actions[trimmedBody](sock, msg, from);
      } catch (actionErr) {
        console.error("Action Execution Error:", actionErr.message);
      }
      return;
    }

    // -------------------------------------------------------------
    // ⚡ 4. Prefix & Command Execution (.ping, .tt, .ctt...)
    // -------------------------------------------------------------
    if (!trimmedBody.startsWith(config.PREFIX)) return;

    const args = trimmedBody.slice(config.PREFIX.length).trim().split(/ +/);
    const cmdName = (args.shift() || "").toLowerCase();

    const cmd = commands.get(cmdName);
    if (cmd) {
      await cmd.execute(sock, msg, from, args, { registerReply });
    }
  } catch (err) {
    console.error("Handler Error:", err);
  }
}

module.exports = { handleMessage, commands, registerReply };
