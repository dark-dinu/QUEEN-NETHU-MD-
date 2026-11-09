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
 * Commands ඇතුළෙන් 1, 2, 3 Interactive Menu එකක් Register කරන Helper Function එක
 * @param {string} from - Chat JID
 * @param {string} sender - User JID
 * @param {string} msgId - Menu message key ID
 * @param {object} actions - { "1": async () => {}, "2": async () => {}, "3": async () => {} }
 * @param {number} timeoutMs - Timeout කාලය (Default: තත්පර 120)
 */
function registerReply(from, sender, msgId, actions, timeoutMs = 120000) {
  const sessionKey = `${from}_${sender}`;
  
  // කලින් session එකක් තිබුණා නම් clear කිරීම
  if (replySessions.has(sessionKey)) {
    clearTimeout(replySessions.get(sessionKey).timer);
  }

  const timer = setTimeout(() => {
    replySessions.delete(sessionKey);
  }, timeoutMs);

  replySessions.set(sessionKey, {
    msgId,
    actions,
    timer
  });
}

/**
 * Main Message Dispatcher
 */
async function handleMessage(sock, msg) {
  try {
    if (!msg?.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";

    const trimmedBody = body.trim();

    // Context / Quoted Message details ලබා ගැනීම
    const contextInfo =
      msg.message.extendedTextMessage?.contextInfo ||
      msg.message.imageMessage?.contextInfo ||
      msg.message.videoMessage?.contextInfo;
    const quotedMsgId = contextInfo?.stanzaId;

    // -------------------------------------------------------------
    // 🎯 1. Interactive 1, 2, 3 Reply Handling
    // -------------------------------------------------------------
    const sessionKey = `${from}_${sender}`;
    if (replySessions.has(sessionKey)) {
      const session = replySessions.get(sessionKey);

      // Quoted reply එකක් නම් අදාළ msgId එකට match වීම හෝ අංකයක් පමණක් වීම
      const isMatchingReply = !quotedMsgId || quotedMsgId === session.msgId;

      if (isMatchingReply && session.actions[trimmedBody]) {
        clearTimeout(session.timer);
        replySessions.delete(sessionKey);

        await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});

        // Command එක ඇතුළේ ලියූ අදාළ function එක execute වීම
        await session.actions[trimmedBody](sock, msg, from);
        return;
      }
    }

    // -------------------------------------------------------------
    // ⚡ 2. Prefix & Command Execution (.ping, .tt, ආදිය)
    // -------------------------------------------------------------
    if (!trimmedBody.startsWith(config.PREFIX)) return;

    const args = trimmedBody.slice(config.PREFIX.length).trim().split(/ +/);
    const cmdName = (args.shift() || "").toLowerCase();

    const cmd = commands.get(cmdName);
    if (cmd) {
      // Command එක ඇතුළේ registerReply පාවිච්චි කිරීමට හැකි වන පරිදි pass කිරීම
      await cmd.execute(sock, msg, from, args, { registerReply });
    }
  } catch (err) {
    console.error("Handler Error:", err);
  }
}

module.exports = { handleMessage, commands, registerReply };
