const express = require("express");
const mongoose = require("mongoose");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require("@whiskeysockets/baileys");
const config = require("./config");
const { useMongoAuthState, isLinked, clearAuth } = require("./auth");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock = null;
let isConnected = false;
let isConnecting = false;

// Dynamic Commands loader
const commands = new Map();
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
  for (const file of files) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.name && cmd.execute) {
      commands.set(cmd.name.toLowerCase(), cmd);
    }
  }
}

// 🌐 Glassmorphism Web UI
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QUEEN NETHU MD | Pairing Hub</title>
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
    <p>Official Multi-Device Pairing</p>

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
          checkStatus();
        } else {
          alert(data.error || "Failed to generate code.");
          btn.innerText = "Try Again";
          btn.disabled = false;
        }
      } catch (err) {
        alert("Server error. Try again.");
        btn.innerText = "Try Again";
        btn.disabled = false;
      }
    }

    function checkStatus() {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/status');
          const data = await res.json();
          if (data.linked) {
            clearInterval(interval);
            document.getElementById('statusText').innerText = "✅ Successfully Linked! Bot is now Online.";
          }
        } catch {}
      }, 3000);
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

app.get("/status", (req, res) => {
  res.json({ linked: isConnected });
});

// ⚡ Pairing Code Route
app.get("/code", async (req, res) => {
  const num = String(req.query.number || "").replace(/[^0-9]/g, "");
  if (!num || num.length < 10) {
    return res.status(400).json({ error: "කරුණාකර නිවැරදි අංකය ලබා දෙන්න (උදා: 94719845166)" });
  }

  if (isConnected) {
    return res.json({ error: "Bot දැනටමත් සාර්ථකව WhatsApp සමඟ Link වී ඇත." });
  }

  try {
    if (!sock || !sock.ws?.isOpen) {
      await startBotEngine();
    }

    // Handshake එකට තත්පර 2ක් ලබා දී code එක request කිරීම
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        return res.json({ code });
      } catch (err) {
        console.error("Pairing Error:", err.message);
        return res.status(500).json({ error: "WhatsApp එකෙන් pairing code එක ප්‍රතික්ෂේප කළා. දුරකථන අංකය පරීක්ෂා කරන්න." });
      }
    }, 2000);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// 🚀 Core Engine
async function startBotEngine() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    const { state, saveCreds } = await useMongoAuthState();
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: pino({ level: "fatal" }),
      auth: state,
      // Official desktop Chrome fingerprint
      browser: Browsers.macOS("Chrome"),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 0
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        isConnected = true;
        isConnecting = false;
        console.log(`🚀 ${config.BOT_NAME} Connected and Online!`);

        const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
        await sock.sendMessage(ownerJid, {
          text: `👑 *${config.BOT_NAME} ONLINE!*\n\n⚡ WhatsApp Multi-Device Auto-Connected!\nType *${config.PREFIX}ping* or *${config.PREFIX}alive* to test.`
        }).catch(() => {});
      }

      if (connection === "close") {
        isConnected = false;
        isConnecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`Connection closed with code: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("Session logged out. Clearing database...");
          await clearAuth();
          startBotEngine();
        } else {
          // Restart Code (515) හෝ Network drops වලදී auto reconnect වීම
          setTimeout(startBotEngine, 3000);
        }
      }
    });

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
      const cmdName = (args.shift() || "").toLowerCase();

      const cmd = commands.get(cmdName);
      if (cmd) {
        cmd.execute(sock, msg, from, args).catch(console.error);
      }
    });

  } catch (err) {
    console.error("Engine Start Error:", err);
    isConnecting = false;
    setTimeout(startBotEngine, 5000);
  }
}

// Start Server
async function main() {
  app.listen(config.PORT, () => {
    console.log(`🌐 Web UI Live on Port ${config.PORT}`);
  });

  try {
    await mongoose.connect(config.MONGO_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 20000 });
    console.log("⚡ MongoDB Connected!");
    await startBotEngine();
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
}

main().catch(console.error);
