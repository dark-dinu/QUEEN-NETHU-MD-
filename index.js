const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const config = require("./config");

// MongoDB Session Setup
const AuthSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    data: { type: String, required: true }
  },
  { timestamps: false }
);
const AuthModel = mongoose.model("SessionAuth", AuthSchema);

// In-Memory RAM Cache to eliminate DB read delays
const memCache = new Map();

async function useFastMongoAuthState() {
  const writeData = async (id, data) => {
    memCache.set(id, data);
    const serialized = JSON.stringify(data, (key, value) => {
      if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
        return { type: "Buffer", data: Array.from(value) };
      }
      return value;
    });
    // Write asynchronously in background without blocking response loop
    AuthModel.updateOne({ id }, { data: serialized }, { upsert: true }).catch(() => {});
  };

  const readData = async (id) => {
    if (memCache.has(id)) return memCache.get(id);
    try {
      const doc = await AuthModel.findOne({ id }).lean().exec();
      if (!doc) return null;
      const parsed = JSON.parse(doc.data, (key, value) => {
        if (value && value.type === "Buffer" && Array.isArray(value.data)) {
          return Buffer.from(value.data);
        }
        return value;
      });
      memCache.set(id, parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    memCache.delete(id);
    AuthModel.deleteOne({ id }).catch(() => {});
  };

  const creds = (await readData("creds")) || (await import("@whiskeysockets/baileys")).initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData("creds", creds)
  };
}

// Fast Command Loader
const commands = new Map();
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.name && cmd.execute) commands.set(cmd.name.toLowerCase(), cmd);
  }
}

async function startQueenNethuBot() {
  await mongoose.connect(config.MONGO_URI, {
    maxPoolSize: 20, // High throughput connection pool
    serverSelectionTimeoutMS: 5000
  });
  console.log("⚡ MongoDB Connected (High-Speed Pool Ready)");

  const { state, saveCreds } = await useFastMongoAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "fatal" }), // Suppress I/O logging overhead
    auth: state,
    browser: ["QUEEN-NETHU-MD", "Chrome", "130.0.6723.117"], // Modern desktop Chrome identity
    syncFullHistory: false, // Prevents loading heavy old chats (drastically cuts startup time)
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    generateHighQualityLinkPreview: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\nScan this QR Code:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startQueenNethuBot();
    } else if (connection === "open") {
      console.log(`🚀 ${config.BOT_NAME} Connected and Running Ultra-Fast!`);
    }
  });

  // Zero-Latency Message Dispatcher
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    if (!body.startsWith(config.PREFIX)) return;

    const args = body.slice(config.PREFIX.length).trim().split(/ +/);
    const cmdName = args.shift().toLowerCase();

    const cmd = commands.get(cmdName);
    if (cmd) {
      cmd.execute(sock, msg, from, args).catch(err => {
        console.error(`Error on command ${cmdName}:`, err);
      });
    }
  });
}

startQueenNethuBot().catch(console.error);
