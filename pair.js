const express = require("express");
const mongoose = require("mongoose");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto
} = require("@whiskeysockets/baileys");
const config = require("./config");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Session Setup
const AuthSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  data: { type: String, required: true }
});
const AuthModel = mongoose.model("SessionAuth", AuthSchema);

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

// 🌐 Modern Glassmorphism Web UI
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
      background: linear-gradient(135deg, #0f172a, #1e1b4b);
      color: #fff;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(16px);
      padding: 35px 30px;
      border-radius: 20px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    }
    h1 { font-size: 24px; font-weight: 700; color: #a855f7; margin-bottom: 8px; }
    p { font-size: 13px; color: #94a3b8; margin-bottom: 25px; }
    .input-group { text-align: left; margin-bottom: 20px; }
    label { font-size: 12px; color: #cbd5e1; display: block; margin-bottom: 6px; font-weight: 600; }
    input {
      width: 100%;
      padding: 14px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid #334155;
      border-radius: 10px;
      color: #fff;
      font-size: 15px;
      outline: none;
      transition: border 0.3s;
    }
    input:focus { border-color: #a855f7; }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #a855f7, #6366f1);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    }
    button:active { transform: scale(0.98); }
    .code-box {
      margin-top: 25px;
      background: rgba(0, 0, 0, 0.4);
      padding: 18px;
      border-radius: 12px;
      border: 1px dashed #a855f7;
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
    .status { font-size: 12px; margin-top: 10px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>QUEEN NETHU MD</h1>
    <p>Link your WhatsApp account via Pairing Code</p>

    <div class="input-group">
      <label>Country Code + Phone Number</label>
      <input type="text" id="phone" placeholder="947xxxxxxxx" />
    </div>

    <button id="submitBtn" onclick="getCode()">Get Pairing Code</button>

    <div class="code-box" id="codeBox">
      <div style="font-size: 12px; margin-bottom: 5px; color: #cbd5e1;">Tap to copy your code:</div>
      <span id="pairCode" onclick="copyCode()">--------</span>
      <div class="status" id="statusText">Enter this code on WhatsApp notification</div>
    </div>
  </div>

  <script>
    async function getCode() {
      const phoneInput = document.getElementById('phone').value.trim();
      const num = phoneInput.replace(/[^0-9]/g, '');
      const btn = document.getElementById('submitBtn');
      const codeBox = document.getElementById('codeBox');
      const pairCode = document.getElementById('pairCode');
      const statusText = document.getElementById('statusText');

      if (!num || num.length < 10) {
        alert("කරුණාකර රටේ කේතය (Country Code) සහිත නිවැරදි දුරකථන අංකයක් ඇතුළත් කරන්න.");
        return;
      }

      btn.disabled = true;
      btn.innerText = "Connecting...";
      codeBox.style.display = "none";

      try {
        const res = await fetch('/code?number=' + num);
        const data = await res.json();

        if (data.code) {
          pairCode.innerText = data.code;
          codeBox.style.display = "block";
          statusText.innerText = "WhatsApp -> Linked Devices -> Link with phone number";
          btn.innerText = "Get Pairing Code";
          btn.disabled = false;
        } else {
          alert(data.error || "Failed to generate pairing code.");
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
      const code = document.getElementById('pairCode').innerText;
      navigator.clipboard.writeText(code);
      alert("Code Copied: " + code);
    }
  </script>
</body>
</html>
  `);
});

// ⚡ Fast Pairing Endpoint
app.get("/code", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "Phone number required" });
  num = num.replace(/[^0-9]/g, "");

  try {
    const { state, saveCreds } = await useFastMongoAuthState();
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "fatal" }),
      auth: state,
      browser: ["QUEEN-NETHU-MD", "Chrome", "130.0.6723.117"],
      syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    if (!sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(num);
          return res.json({ code: code?.match(/.{1,4}/g)?.join("-") || code });
        } catch (err) {
          return res.status(500).json({ error: "Failed to request code. Try again." });
        }
      }, 3000);
    } else {
      return res.json({ error: "Device already registered. Delete DB to re-link." });
    }

    sock.ev.on("connection.update", async (update) => {
      const { connection } = update;
      if (connection === "open") {
        console.log("🎉 Linked Successfully to WhatsApp via Web!");
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

async function main() {
  await mongoose.connect(config.MONGO_URI, { maxPoolSize: 20 });
  console.log("⚡ MongoDB Connected to Web Server");
  app.listen(PORT, () => {
    console.log(`🌐 Pairing Web Server Live on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
