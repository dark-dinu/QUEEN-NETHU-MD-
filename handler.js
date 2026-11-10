const fs = require("fs");
const path = require("path");
const config = require("./config");

// Commands Registry
const commands = new Map();
const commandsPath = path.join(__dirname, "commands");

// 🎯 Interactive Session Storage (1, 2, 3 Reply Handling)
const replySessions = new Map();

// Load Commands Dynamically
if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.name && cmd.execute) {
      commands.set(cmd.name.toLowerCase(), cmd);
      if (cmd.aliases && Array.isArray(cmd.aliases)) {
        for (const alias of cmd.aliases) {
          commands.set(alias.toLowerCase(), cmd);
        }
      }
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

/**
 * Clean Message Dispatcher
 */
async function handleMessage(sock, msg) {
  try {
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    // Status broadcast සහ අනවශ්‍ය protocol packets මෙතැනින් filter වේ
    if (!from || from === "status@broadcast") return;
    if (msg.message.senderKeyDistributionMessage || msg.message.protocolMessage) return;

    const rawSender = msg.key.participant || (msg.key.fromMe ? sock.user?.id : from);
    const sender = cleanJid(rawSender);
    const body = extractMessageContent(msg);
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    // -------------------------------------------------------------
    // 🎯 1. Interactive 1, 2, 3 Reply Handling
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
        console.error("[ACTION ERROR]:", actionErr.message);
      }
      return;
    }

    // -------------------------------------------------------------
    // ⚡ 2. Prefix & Commands Execution (.ping, .tt, .ctt, .save...)
    // -------------------------------------------------------------
    if (!trimmedBody.startsWith(config.PREFIX)) return;

    const args = trimmedBody.slice(config.PREFIX.length).trim().split(/ +/);
    const cmdName = (args.shift() || "").toLowerCase();

    const cmd = commands.get(cmdName);
    if (cmd) {
      await cmd.execute(sock, msg, from, args, { registerReply });
    }
  } catch (err) {
    console.error("[HANDLER ERROR]:", err);
  }
}

module.exports = { handleMessage, commands, registerReply };
