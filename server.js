const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  delay
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "Phone number is required" });

  num = num.replace(/[^0-9]/g, "");
  
  // කලින් හැදුනු temp sessions සම්පූර්ණයෙන්ම clear කිරීම
  const tempId = `session_${num}`;
  const tempDir = path.join(__dirname, "temp", tempId);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(tempDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
      version,
      logger: pino({ level: "fatal" }),
      printQRInTerminal: false,
      auth: state,
      // Official WhatsApp Web Chrome Signature එක (Couldn't link device error එක එන්නේ නැති වෙන්න)
      browser: Browsers.macOS("Chrome"),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000
    });

    sock.ev.on("creds.update", saveCreds);

    let codeSent = false;

    // Socket එක server එකට සම්බන්ධ වූ පසු පමණක් code එක ඉල්ලීම
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "connecting" && !codeSent && !sock.authState.creds.registered) {
        await delay(3000); // Server handshake එකට තත්පර 3ක් ඉඩ දීම
        try {
          const rawCode = await sock.requestPairingCode(num);
          const formattedCode = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
          codeSent = true;
          return res.json({ code: formattedCode });
        } catch (err) {
          console.error("Pair code error:", err.message);
          if (!res.headersSent) {
            return res.status(500).json({ error: "Pairing code request failed. Try again." });
          }
        }
      }

      if (connection === "open") {
        console.log(`✅ Device paired successfully for ${num}`);
        await delay(2000);

        try {
          const credsPath = path.join(tempDir, "creds.json");
          if (fs.existsSync(credsPath)) {
            const rawCreds = fs.readFileSync(credsPath, "utf-8");
            const b64 = Buffer.from(rawCreds).toString("base64");
            const sessionId = `NETH-UXMD~${b64}`;

            const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const sessionText = `👑 *QUEEN NETHU MD CONNECTED* 👑\n\n` +
              `*Session Key:*\n\`\`\`${sessionId}\`\`\`\n\n` +
              `⚠️ _මෙම Session Key එක වෙනත් කිසිවෙකුට ලබා නොදෙන්න._`;

            await sock.sendMessage(userJid, { text: sessionText });
          }
        } catch (e) {
          console.error("Session dispatch error:", e.message);
        } finally {
          await delay(3000);
          await sock.end();
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }

      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`Connection closed: ${reason}`);
      }
    });

  } catch (err) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Queen Nethu Pair Server active on port: ${PORT}`);
});
