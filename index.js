const express = require("express");
const mongoose = require("mongoose");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const config = require("./config");
const { useMongoAuthState } = require("./auth");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let globalSock = null;

// Command Handler Setup
const commands = new Map();
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  fs.readdirSync(commandsPath).filter(f => f.endsWith(".js")).forEach(file => {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.name && cmd.execute) commands.set(cmd.name.toLowerCase(), cmd);
  });
}

// 🌐 Glassmorphism Web Interface
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QUEEN NETHU MD | Web Hub</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Poppins', sans-serif; }
    body {
      background: radial-gradient(circle at center, #1e1b4b, #0f172a);
      color: #fff;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      padding: 40px 30px;
      border-radius: 24px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    }
    h1 { font-size: 26px; font-weight: 700; color: #c084fc; margin-bottom: 6px; }
    p { font-size: 13px; color: #94a3b8; margin-bottom: 25px; }
    .input-group { text-align: left; margin-bottom: 20px; }
    label { font-size: 13px; color: #e2e8f0; display: block; margin-bottom: 8px; font-weight: 500; }
    input {
      width: 100%;
      padding: 14px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid #334155;
      border-radius: 12px;
      color: #fff;
      font-size: 16px;
      outline: none;
      transition: all 0.3s;
    }
    input:focus { border-color: #a855f7; box-shadow: 0 0 10px rgba(168, 85, 247, 0.3); }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #a855f7, #6366f1);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    }
    button:active { transform: scale(0.98); }
    .code-box {
      margin-top: 25px;
      background: rgba(0, 0, 0, 0.5);
      padding: 20px;
      border-radius: 14px;
      border: 1px dashed #c084fc;
      display: none;
    }
    .code-box span {
      display: block;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 6px;
      color: #38bdf8;
      cursor: pointer;
    }
    .status { font-size: 12px; margin-top: 10px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>QUEEN NETHU MD</h1>
    <p>Chrome Multi-Device Pairing Hub</p>

    <div class="input-group">
      <label>WhatsApp Number (With Country Code)</label>
      <input type="text" id="phone" placeholder="94719845166" />
    </div>

    <button id="submitBtn" onclick="getCode()">Get Pairing Code</button>

    <div class="code-box" id="codeBox">
      <div style="font-size: 12px; margin-bottom: 6px; color: #cbd5e1;">Click code to copy:</div>
      <span id="pairCode" onclick="copyCode()">--------</span>
      <div class="status" id="statusText">Enter this code into WhatsApp now!</div>
    </div>
  </div>

  <script>
    async function getCode() {
      const phoneInput = document.getElementById('phone').value.trim();
      const num = phoneInput.replace(/[^0-9]/g, '');
      const btn = document.getElementById('submitBtn');
      const codeBox = document.getElementById('codeBox');
      const pairCode = document.getElementById('pairCode');

      if (!num || num.length < 10) {
        alert("කරුණාකර Country Code එක සහිත නිවැරදි දුරකථන අංකයක් ඇතුළත් කරන්න.");
        return;
      }

      btn.disabled = true;
      btn.innerText = "Requesting Code...";
      codeBox.style.display = "none";

      try {
        const res = await fetch('/code?number=' + num);
        const data = await res.json();

        if (data.code) {
          pairCode.innerText = data.code;
          codeBox.style.display = "block";
          btn.innerText = "Get New Code";
          btn.disabled = false;
        } else {
          alert(data.error || "Failed to generate pairing code.");
          btn.innerText = "Try Again";
          btn.disabled = false;
        }
      } catch (err) {
        alert("Server error.");
        btn.innerText = "Try Again";
        btn.disabled = false;
      }
    }

    function copyCode() {
      const code = document.getElementById('pairCode').innerText.replace(/-/g, '');
      navigator.clipboard.writeText(code);
      alert("Code Copied: " + code);
    }
  </script>
</body>
</html>
  `);
});

// ⚡ Web Pairing Endpoint
app.get("/code", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "Phone number required" });
  num = num.replace(/[^0-9]/g, "");

  if (globalSock && !globalSock.authState.creds.registered) {
    try {
      let code = await globalSock.requestPairingCode(num);
      code = code?.match(/.{1,4}/g)?.join("-") || code;
      return res.json({ code });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to generate code." });
    }
  } else if (globalSock && globalSock.authState.creds.registered) {
    return res.json({ error: "Bot is already registered and running!" });
  } else {
    return res.status(500).json({ error: "Socket not ready yet." });
  }
});

// 🚀 Start Bot & Socket
async function startBot() {
  const { state, saveCreds } = await useMongoAuthState();
  const { version } = await fetchLatestBaileysVersion();

  globalSock = makeWASocket({
    version,
    logger: pino({ level: "fatal" }),
    auth: state,
    browser: ["Chrome (Linux)", "Chrome", "130.0.6723.117"],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000
  });

  globalSock.ev.on("creds.update", saveCreds);

  globalSock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (Code: ${statusCode}). Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        startBot();
      } else {
        console.log("Session logged out. Clear DB to re-link.");
      }
    } else if (connection === "open") {
      console.log(`🚀 ${config.BOT_NAME} Connected Successfully!`);
      const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
      await globalSock.sendMessage(ownerJid, {
        text: `👑 *${config.BOT_NAME} ONLINE!*\n\n⚡ Web Pairing & Mongo Cache Active!\nType *${config.PREFIX}ping* to test.`
      }).catch(() => {});
    }
  });

  globalSock.ev.on("messages.upsert", async ({ messages, type }) => {
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
      cmd.execute(globalSock, msg, from, args).catch(console.error);
    }
  });
}

// Initialize Everything
async function main() {
  await mongoose.connect(config.MONGO_URI, { maxPoolSize: 20 });
  console.log("⚡ MongoDB Connected!");

  app.listen(config.PORT, () => {
    console.log(`🌐 Web UI Live on Port ${config.PORT}`);
  });

  await startBot();
}

main().catch(console.error);
