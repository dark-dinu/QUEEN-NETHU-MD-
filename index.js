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
const readline = require("readline");
const config = require("./config");
const { connectDB, getSettings } = require("./database/mongo");

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

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

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

  // Pairing Flow with Device Tag NETH-UXMD
  if (!sock.authState.creds.registered) {
    console.log(`\n=================================================`);
    console.log(`       👑 ${config.BOT_NAME} - INSTANT LINK        `);
    console.log(`=================================================\n`);

    let phoneNumber = await question("Enter WhatsApp Number (with Country Code, e.g. 94719845166): ");
    phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

    await delay(1500);

    try {
      const code = await sock.requestPairingCode(phoneNumber);
      const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;

      console.log(`\n=================================================`);
      console.log(`DEVICE TAG    : \x1b[36m${config.DEVICE_NAME}\x1b[0m`);
      console.log(`PAIRING CODE  : \x1b[32m\x1b[1m${formattedCode}\x1b[0m`);
      console.log(`=================================================`);
      console.log(`WhatsApp Settings > Linked Devices > Link with Phone Number හරහා code එක enter කරන්න.\n`);
    } catch (err) {
      console.error("Pairing request failed:", err.message);
    }
  }

  sock.ev.on("creds.update", saveCreds);

  // Status Auto Seen & Auto React
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const settings = await getSettings();

    for (const msg of messages) {
      if (!msg.message) continue;

      // Handle Status Updates
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

      // Handle Commands
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
          console.error(`Command execution error (${cmdName}):`, err);
        }
      }
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (Code: ${statusCode}). Auto-reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log(`\n✅ ${config.BOT_NAME} CONNECTED AND ONLINE!`);

      const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      const connectedAlert = `👑 *${config.BOT_NAME} CONNECTED* 👑\n\n` +
        `• *Device Identifier:* ${config.DEVICE_NAME} (Chrome)\n` +
        `• *Auto Status Seen:* 🟢 Active\n` +
        `• *Auto Status React:* 🟢 Active\n` +
        `• *Database:* MongoDB Linked`;

      await sock.sendMessage(userJid, { text: connectedAlert });
    }
  });
}

startBot();
