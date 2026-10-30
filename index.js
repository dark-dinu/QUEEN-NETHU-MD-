const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const express = require("express");
const config = require("./config");
const { connectDB, getSettings } = require("./database/mongo");

// Keep-Alive Web Server for Render
const app = express();
app.get("/", (req, res) => res.send(`👑 ${config.BOT_NAME} is active & running!`));
app.listen(config.PORT, () => {
  console.log(`🌐 Web server running on port ${config.PORT}`);
});

const commands = new Map();

function loadPlugins() {
  const pluginDir = path.join(__dirname, "plugins");
  if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir);

  const files = fs.readdirSync(pluginDir).filter(file => file.endsWith(".js"));
  commands.clear();

  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(pluginDir, file))];
      const plugin = require(path.join(pluginDir, file));
      if (plugin.command && typeof plugin.execute === "function") {
        commands.set(plugin.command.toLowerCase(), plugin);
        if (plugin.aliases && Array.isArray(plugin.aliases)) {
          plugin.aliases.forEach(alias => commands.set(alias.toLowerCase(), plugin));
        }
      }
    } catch (e) {
      console.error(`❌ Error loading plugin ${file}:`, e.message);
    }
  }
  console.log(`🧩 Loaded ${commands.size} commands successfully.`);
}

async function startBot() {
  await connectDB();
  loadPlugins();

  const sessionDir = path.join(__dirname, "session");
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: config.BROWSER,
    syncFullHistory: false
  });

  // Direct Cloud Pairing Flow (No Terminal Input Needed)
  if (!sock.authState.creds.registered) {
    console.log(`\n=================================================`);
    console.log(`       👑 ${config.BOT_NAME} - INSTANT LINK        `);
    console.log(`=================================================`);

    const cleanNumber = String(config.PHONE_NUMBER).replace(/[^0-9]/g, "");

    await delay(3000); // Wait for connection readiness

    try {
      const code = await sock.requestPairingCode(cleanNumber);
      const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

      console.log(`\n=================================================`);
      console.log(`TARGET NUMBER : ${cleanNumber}`);
      console.log(`DEVICE TAG    : ${config.DEVICE_NAME}`);
      console.log(`PAIRING CODE  : \x1b[32m\x1b[1m${formattedCode}\x1b[0m`);
      console.log(`=================================================`);
      console.log(`WhatsApp > Linked Devices > Link with Phone Number හරහා ඉහත Code එක ඇතුළත් කරන්න.\n`);
    } catch (err) {
      console.error("❌ Pairing request failed:", err.message);
    }
  }

  sock.ev.on("creds.update", saveCreds);

  // Status Auto Seen & Auto React
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const settings = await getSettings();

    for (const msg of messages) {
      if (!msg.message) continue;

      // Status Processing
      if (msg.key.remoteJid === "status@broadcast") {
        if (settings.autoStatusSeen) {
          await sock.readMessages([msg.key]);
        }

        if (settings.autoStatusReact && settings.reactions.length > 0) {
          const randomEmoji = settings.reactions[Math.floor(Math.random() * settings.reactions.length)];
          await sock.sendMessage("status@broadcast", {
            react: {
              text: randomEmoji,
              key: msg.key
            }
          }, { statusJidList: [msg.key.participant] });
        }
        continue;
      }

      // Command Execution
      const from = msg.key.remoteJid;
      const body = msg.message.conversation ||
                   msg.message.extendedTextMessage?.text ||
                   msg.message.imageMessage?.caption ||
                   "";

      if (!body.startsWith(settings.prefix)) continue;

      const args = body.slice(settings.prefix.length).trim().split(/ +/);
      const cmdName = args.shift().toLowerCase();
      const plugin = commands.get(cmdName);

      if (plugin) {
        try {
          await plugin.execute({ sock, msg, args, from, settings });
        } catch (err) {
          console.error(`Command error (${cmdName}):`, err);
        }
      }
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (Code: ${statusCode}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log(`\n✅ ${config.BOT_NAME} CONNECTED SUCCESSFULLY!`);

      const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      const connectedAlert = `👑 *${config.BOT_NAME} CONNECTED* 👑\n\n` +
        `• *Device Identifier:* ${config.DEVICE_NAME} (Chrome)\n` +
        `• *Auto Status Seen:* 🟢 Active\n` +
        `• *Auto Status React:* 🟢 Active\n` +
        `• *Database:* Synced`;

      await sock.sendMessage(userJid, { text: connectedAlert });
    }
  });
}

startBot();
