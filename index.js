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

let botSock = null;

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

// 🌐 Glassmorphism Web Interface
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
    <p>Chrome Multi-Device Pairing Hub</p>

    <div class="input-group">
      <label>WhatsApp Number (With Country Code)</label>
      <input type="text" id="phone" placeholder="94719845166" />
    </div>

    <button id="submitBtn" onclick="getCode()">Get Pairing Code</button>

    <div class="code-box" id="codeBox">
      <div style="font-size: 12px; margin-bottom: 6px; color: #cbd5e1;">Click code to copy:</div>
      <span id="pairCode" onclick="copyCode()">--------</span>
      <div class="status" id="statusText">Enter this code into WhatsApp Linked Devices now!</div>
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
        alert("කරුණාකර Country Code එක සහිත නිවැරදි දුරකථන අංකයක් ඇතුළත් කරන්න (උදා: 94719845166).");
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
          pollStatus();
        } else {
          alert(data.error || "Failed to generate code.");
          btn.innerText = "Try Again";
          btn.disabled = false;
        }
      } catch (err) {
        alert("Server error. Please try again.");
        btn.innerText = "Try Again";
        btn.disabled = false;
      }
    }

    let poller = null;
    function pollStatus() {
      clearInterval(poller);
      let tries = 0;
      poller = setInterval(async () => {
        tries++;
        try {
          const r = await fetch('/status');
          const d = await r.json();
          if (d.linked) {
            clearInterval(poller);
            document.getElementById('statusText').innerText = "✅ Linked successfully! Bot is online.";
          }
        } catch (e) {}
        if (tries > 60) clearInterval(poller);
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

// ---------------------------------------------------------------------------
// 🔗 Linking helpers
// ---------------------------------------------------------------------------
let pairSock = null;
let botConnected = false;
let botStarting = false;
let linkState = "idle"; // idle | waiting | linked

function killSock(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.end(undefined); } catch {}
}

app.get("/status", (req, res) => {
  res.json({ linked: botConnected, state: linkState });
});

// ⚡ Pairing code endpoint
app.get("/code", async (req, res) => {
  const num = String(req.query.number || "").replace(/[^0-9]/g, "");
  if (!num || num.length < 10) {
    return res.status(400).json({ error: "Country code එක සහිත නිවැරදි අංකයක් දෙන්න (උදා: 94719845166)" });
  }
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database not connected. MongoDB URI / Atlas Network Access (0.0.0.0/0) check කරන්න." });
  }

  let responded = false;
  const respond = (status, body) => {
    if (responded) return;
    responded = true;
    res.status(status).json(body);
  };

  try {
    let auth = await useMongoAuthState();
    if (isLinked(auth.state.creds)) {
      return respond(200, { error: "Bot දැනටමත් link වෙලා! වෙන number එකක් link කරන්න නම් MongoDB එකේ SessionAuth collection එක clear කරලා restart කරන්න." });
    }

    // link වෙලා නැති session එකක් නිසා හැම attempt එකකටම අලුත් creds පාවිච්චි කරනවා
    killSock(pairSock);
    pairSock = null;
    await clearAuth();
    auth = await useMongoAuthState();
    const { state, saveCreds } = auth;

    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      logger: pino({ level: "fatal" }),
      auth: state,
      browser: Browsers.macOS("Chrome"),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false
    });
    pairSock = sock;
    sock.ev.on("creds.update", saveCreds);

    let requested = false;
    const requestCode = async () => {
      if (requested) return;
      requested = true;
      try {
        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        linkState = "waiting";
        console.log(`🔑 Pairing code generated for ${num}`);
        respond(200, { code });
      } catch (err) {
        console.error("Pairing request failed:", err?.message || err);
        respond(500, { error: "WhatsApp rejected the request. Number එක (country code, + නැතුව) check කරලා ආයෙ try කරන්න." });
        killSock(sock);
        if (pairSock === sock) pairSock = null;
      }
    };

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      // qr event එක ආවම websocket එක ready — pairing code ඉල්ලන්න හොඳම වෙලාව
      if (qr) requestCode();

      if (connection === "open") {
        console.log("🎉 Linked successfully!");
        linkState = "linked";
        killSock(sock);
        if (pairSock === sock) pairSock = null;
        startBot();
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (isLinked(state.creds)) {
          // Pair success වුණාම WhatsApp restart (515) ඉල්ලනවා -> main bot එක start කරනවා
          console.log(`✅ Pair success (${statusCode}). Starting main bot...`);
          linkState = "linked";
          killSock(sock);
          if (pairSock === sock) pairSock = null;
          setTimeout(startBot, 1000);
        } else {
          console.log(`Pairing socket closed before link (${statusCode}).`);
          respond(500, { error: `WhatsApp connection closed (${statusCode}). ආයෙ try කරන්න.` });
          if (pairSock === sock) pairSock = null;
          linkState = "idle";
        }
      }
    });

    // qr event එක නොආවොත් fallback
    setTimeout(requestCode, 6000);
    setTimeout(() => respond(504, { error: "WhatsApp response එකක් ආවෙ නෑ. ආයෙ try කරන්න." }), 30000);
  } catch (err) {
    console.error("Endpoint Error:", err);
    respond(500, { error: "Internal Server Error" });
  }
});

// ---------------------------------------------------------------------------
// 🚀 Main Bot Loop (link වුණාට පස්සෙ)
// ---------------------------------------------------------------------------
async function startBot() {
  if (botStarting) return;
  botStarting = true;
  try {
    const { state, saveCreds } = await useMongoAuthState();
    if (!isLinked(state.creds)) {
      console.log("⚠️ Waiting for WhatsApp pairing via web page...");
      return;
    }

    killSock(botSock);
    botSock = null;
    botConnected = false;

    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      logger: pino({ level: "fatal" }),
      auth: state,
      browser: Browsers.macOS("Chrome"),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000
    });
    botSock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        botConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`Bot connection closed (${statusCode}).`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("Session logged out. Database clear කළා — web page එකෙන් ආයෙ link කරන්න.");
          linkState = "idle";
          botSock = null;
          await clearAuth().catch(() => {});
        } else if (statusCode === DisconnectReason.connectionReplaced) {
          console.log("Connection replaced by another session. Reconnect නොකරන්නෙ.");
        } else {
          setTimeout(startBot, 3000);
        }
      } else if (connection === "open") {
        botConnected = true;
        linkState = "linked";
        console.log(`🚀 ${config.BOT_NAME} Connected and Online!`);
        const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
        await sock
          .sendMessage(ownerJid, {
            text: `👑 *${config.BOT_NAME} ONLINE!*\n\n⚡ Web Pairing & Mongo Cache Active!\nType *${config.PREFIX}ping* or *${config.PREFIX}alive* to test.`
          })
          .catch(() => {});
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      const msg = messages[0];
      if (!msg?.message) return;

      const from = msg.key.remoteJid;
      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        "";

      // Bot ගේ own replies prefix එකෙන් පටන් ගන්නෙ නැති නිසා fromMe වුණත් command එකක් නම් අවසර දෙනවා
      if (!body.startsWith(config.PREFIX)) return;

      const args = body.slice(config.PREFIX.length).trim().split(/ +/);
      const cmdName = (args.shift() || "").toLowerCase();

      const cmd = commands.get(cmdName);
      if (cmd) {
        Promise.resolve(cmd.execute(sock, msg, from, args)).catch(console.error);
      }
    });
  } catch (err) {
    console.error("startBot error:", err);
    setTimeout(startBot, 5000);
  } finally {
    botStarting = false;
  }
}

// ---------------------------------------------------------------------------
// Start Server (Render port scan එකට කලින් listen කරනවා)
// ---------------------------------------------------------------------------
async function main() {
  app.listen(config.PORT, () => {
    console.log(`🌐 Web UI Live on Port ${config.PORT}`);
  });

  try {
    await mongoose.connect(config.MONGO_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 20000 });
    console.log("⚡ MongoDB Connected!");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("   -> MONGO_URI නිවැරදිද බලන්න, Atlas > Network Access එකේ 0.0.0.0/0 allow කරන්න.");
    return;
  }

  await startBot();
}

main().catch(console.error);
