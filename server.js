const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  delay
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Route to serve Web UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Endpoint: /pair?number=9471xxxxxxx
app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "Phone number is required" });

  num = num.replace(/[^0-9]/g, "");
  const tempId = `temp_${num}_${Date.now()}`;
  const tempDir = path.join(__dirname, "temp", tempId);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(tempDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: ["NETH-UXMD (Chrome)", "Chrome", "130.0.6723.70"]
    });

    sock.ev.on("creds.update", saveCreds);

    await delay(2000);
    const rawCode = await sock.requestPairingCode(num);
    const formattedCode = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;

    // Return Pairing Code to Frontend
    res.json({ code: formattedCode });

    // Handle Connection & Send NETH-UXMD Session to User WhatsApp
    sock.ev.on("connection.update", async (update) => {
      const { connection } = update;
      if (connection === "open") {
        await delay(3000);
        try {
          const credsPath = path.join(tempDir, "creds.json");
          if (fs.existsSync(credsPath)) {
            const rawCreds = fs.readFileSync(credsPath, "utf-8");
            const b64 = Buffer.from(rawCreds).toString("base64");
            const sessionId = `NETH-UXMD~${b64}`;

            const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const sessionText = `👑 *QUEEN NETHU MD - SESSION ID* 👑\n\n` +
              `*Device:* NETH-UXMD (Chrome Web)\n` +
              `*Session Key:*\n\`\`\`${sessionId}\`\`\`\n\n` +
              `⚠️ _Do not share this key with anyone!_`;

            await sock.sendMessage(userJid, { text: sessionText });
          }
        } catch (e) {
          console.error("Session dispatch error:", e.message);
        } finally {
          await delay(5000);
          await sock.end();
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });

  } catch (err) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    res.status(500).json({ error: "Failed to create pair session. Please retry." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Queen Nethu Pair Site running on: http://localhost:${PORT}`);
});
