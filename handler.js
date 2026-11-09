const fs = require("fs");
const path = require("path");
const config = require("./config");

// Commands Loader
const commands = new Map();
const commandsPath = path.join(__dirname, "commands");

// 🎯 Central In-Memory Interactive Reply Sessions
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

/**
 * WhatsApp JID එකෙන් Device IDs / LIDs ඉවත් කර පිරිසිදු Standard JID එකක් ලබා ගැනීම
 */
function cleanJid(jid = "") {
  if (!jid) return "";
  return jid.split(":")[0].split("@")[0] + "@s.whatsapp.net";
}

/**
 * ViewOnce, Ephemeral, Document ආදී විවිධ Wrappers අස්සේ එන Message එක Unwrap කර Body එක ලබා ගැනීම
 */
function extractMessageContent(msg) {
  let m = msg.message;
  if (!m) return "";

  // Ephemeral, ViewOnce, DocumentMessage unwrapping
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

/**
 * Commands ඇතුළෙන් 1, 2, 3 Interactive Menu එකක් Register කරන Function එක
 * @param {string} from - Chat JID
 * @param {string} sender - User JID
 * @param {string} msgId - Menu message key ID
 * @param {object} actions - { "1": async () => {}, "2": async () => {}, "3": async () => {} }
 * @param {number} timeoutMs - Timeout කාලය (Default: තත්පර 120)
 */
function registerReply(from, sender, msgId, actions, timeoutMs = 120000) {
  // Chat JID එක සහ Sender JID එක පදනම් කරගත් Unique Keys දෙකක් සාදයි (Self-chat compatibility සඳහා)
  const userClean = cleanJid(sender);
  const primaryKey = `${from}_${userClean}`;
  const fallbackKey = `${from}`;

  const cleanup = () => {
    replySessions.delete(primaryKey);
    replySessions.delete(fallbackKey);
  };

  const timer = setTimeout(cleanup, timeoutMs);

  const sessionData = {
    msgId,
    actions,
    timer,
    cleanup
  };

  replySessions.set(primaryKey, sessionData);
  replySessions.set(fallbackKey, sessionData);
}

/**
 * Main Message Dispatcher
 */
async function handleMessage(sock, msg) {
  try {
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    // Status broadcast සහ Protocol/Decryption empty messages ignore කිරීම
    if (!from || from === "status@broadcast" || from.endsWith("@broadcast")) return;

    // Decryption message keys drop වීම වැළැක්වීම (Waiting message triggers ignore කිරීම)
    if (msg.message.senderKeyDistributionMessage || msg.message.protocolMessage) return;

    // Sender හඳුනා ගැනීම (Self-chat, Groups, Private chats සඳහා)
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
        console.error("Action Execution Error:", actionErr.message);
        await sock.sendMessage(
          from,
          { text: `❌ ක්‍රියාවලිය අසාර්ථක විය: ${actionErr.message}` },
          { quoted: msg }
        );
      }
      return;
    }

    // -------------------------------------------------------------
    // ⚡ 2. Prefix & Command Execution (.ping, .tt, .ctt ආදිය)
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
