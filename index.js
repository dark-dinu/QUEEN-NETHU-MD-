const express = require("express");
const mongoose = require("mongoose");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  proto
} = require("@whiskeysockets/baileys");
const config = require("./config");
const { useMongoAuthState, clearAuth } = require("./auth");
const { handleMessage } = require("./handler");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multi-bot memory pool
const bots = {
  bot1: { sock: null, connected: false, connecting: false, name: "Bot 1 (Primary)" },
  bot2: { sock: null, connected: false, connecting: false, name: "Bot 2 (Secondary)" },
  bot3: { sock: null, connected: false, connecting: false, name: "Bot 3 (Third Slot)" }
};

// 🌐 Multi-Bot Web UI (Hard Reload Friendly)
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QUEEN NETHU MD | Multi-Bot Hub</title>
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
      padding: 35px 25px;
      border-radius: 24px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    }
    h1 { font-size: 24px; font-weight: 700; color: #c084fc; margin-bottom: 6px; }
    p { font-size: 13px; color: #94a3b8; margin-bottom: 18px; }
    .status-panel {
      display: flex;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.35);
      padding: 12px 16px;
      border-radius: 12px;
      margin-bottom: 20px;
      font-size: 13px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .status-panel div span { font-weight: bold; }
    .online { color: #4ade80; }
    .offline { color: #f87171; }
    .input-group { text-align: left; margin-bottom: 15px; }
    label { font-size: 12px; color: #e2e8f0; display: block; margin-bottom: 6px; font-weight: 600; }
    select, input {
      width: 100%;
      padding: 13px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid #334155;
      border-radius: 12px;
      color: #fff;
      font-size: 15px;
      outline: none;
      transition: all 0.3s;
    }
    select:focus, input:focus { border-color: #a855f7; box-shadow: 0 0 10px rgba(168, 85, 247, 0.3); }
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
      margin-top: 10px;
    }
    button:active { transform: scale(0.98); }
    .code-box {
      margin-top: 20px;
      background: rgba(0, 0, 0, 0.5);
      padding: 18px;
      border-radius: 14px;
      border: 1px dashed #c084fc;
      display: none;
    }
    .code-box span {
      display: block;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 5px;
      color: #38bdf8;
      cursor: pointer;
    }
    .status { font-size: 12px; margin-top: 8px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>QUEEN NETHU MD</h1>
    <p>Triple Multi-Device Manager</p>

    <div class="status-panel">
      <div>Bot 1: <span id="s_bot1" class="offline">...</span></div>
      <div>Bot 2: <span id="s_bot2" class="offline">...</span></div>
      <div>Bot 3: <span id="s_bot3" class="offline">...</span></div>
    </div>

    <div class="input-group">
      <label>1. Select Bot Slot</label>
      <select id="botSlot">
        <option value="bot1">Bot 1 (Primary)</option>
        <option value="bot2">Bot 2 (Secondary)</option>
        <option value="bot3">Bot 3 (Third Slot)</option>
      </select>
    </div>

    <div class="input-group">
      <label>2. WhatsApp Number (With Country Code)</label>
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
    async function updateStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        for (const [key, val] of Object.entries(data)) {
          const el = document.getElementById('s_' + key);
          if (el) {
            el.innerText = val ? "Online" : "Offline";
            el.className = val ? "online" : "offline";
          }
        }
      } catch {}
    }
    setInterval(updateStatus, 3000);
    updateStatus();

    async function getCode() {
      const slot = document.getElementById('botSlot').value;
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
        const res = await fetch('/code?slot=' + slot + '&number=' + num);
        const data = await res.json();

        if (data.code) {
          pairCode.innerText = data.code;
          codeBox.style.display = "block";
          btn.innerText = "Get New Code";
          btn.disabled = false;
        } else {
          alert(data.error || "Failed to generate code.");
          btn.innerText = "Try Again";
          btn.disabled = false;
        }
      } catch (err) {
        alert("Server communication error.");
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

app.get("/status", (req, res) => {
  res.json({
    bot1: bots.bot1.connected,
    bot2: bots.bot2.connected,
    bot3: bots.bot3.connected
  });
});

// ⚡ Pairing Code Route
app.get("/code", async (req, res) => {
  const slot = req.query.slot || "bot1";
  const num = String(req.query.number || "").replace(/[^0-9]/g, "");

  if (!bots[slot]) {
    return res.status(400).json({ error: "වලංගු නොවන bot slot එකකි." });
  }

  if (!num || num.length < 10) {
    return res.status(400).json({ error: "කරුණාකර නිවැරදි අංකය ලබා දෙන්න (උදා: 94719845166)" });
  }

  if (bots[slot].connected) {
    return res.json({ error: `${bots[slot].name} දැනටමත් සාර්ථකව WhatsApp සමඟ Link වී ඇත. කරුණාකර වෙනත් Bot Slot එකක් තෝරන්න.` });
  }

  try {
    if (!bots[slot].sock || !bots[slot].sock.ws?.isOpen) {
      await startSingleBot(slot);
    }

    setTimeout(async () => {
      try {
        let code = await bots[slot].sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        return res.json({ code });
      } catch (err) {
        console.error(`Pairing Error (${slot}):`, err.message);
        return res.status(500).json({ error: "WhatsApp එකෙන් pairing code එක ප්‍රතික්ෂේප කළා. දුරකථන අංකය පරීක්ෂා කරන්න." });
      }
    }, 2000);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// 🚀 Core Bot Launcher per Slot (Anti-Waiting Message Engine)
async function startSingleBot(slot) {
  const botData = bots[slot];
  if (botData.connecting) return;
  botData.connecting = true;

  try {
    const { state, saveCreds } = await useMongoAuthState(slot);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      auth: state,
      browser: Browsers.macOS("Chrome"),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      defaultQueryTimeoutMs: 0,
      // 🛠️ Stable Decryption: Returning actual container prevents Signal pre-key handshake failure
      getMessage: async (key) => {
        return {
          conversation: "QUEEN_NETHU_SYNC"
        };
      }
    });

    botData.sock = sock;
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        botData.connected = true;
        botData.connecting = false;
        // Silent connect: Owner ට කිසිදු message එකක් නොයවා console log එක පමණක් යොදයි
        console.log(`🚀 [${slot}] ${botData.name} Connected Silently!`);
      }

      if (connection === "close") {
        botData.connected = false;
        botData.connecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`[${slot}] Connection closed with code: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log(`[${slot}] Logged out. Clearing session...`);
          await clearAuth(slot);
          startSingleBot(slot);
        } else {
          setTimeout(() => startSingleBot(slot), 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      const msg = messages[0];
      await handleMessage(sock, msg);
    });

  } catch (err) {
    console.error(`Error starting ${slot}:`, err);
    botData.connecting = false;
    setTimeout(() => startSingleBot(slot), 5000);
  }
}

// 🌐 Start Server & Run All 3 Bots
async function main() {
  app.listen(config.PORT, () => {
    console.log(`🌐 Multi-Bot Web UI Live on Port ${config.PORT}`);
  });

  try {
    await mongoose.connect(config.MONGO_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 20000 });
    console.log("⚡ MongoDB Connected!");

    // Start all 3 bot slots in parallel
    await startSingleBot("bot1");
    await startSingleBot("bot2");
    await startSingleBot("bot3");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
}

main().catch(console.error);
