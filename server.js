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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/pair", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).json({ error: "Phone number is required" });

  num = num.replace(/[^0-9]/g, "");
  
  // කලින් අසාර්ථක වූ temp session එක clean කිරීම
  const tempDir = path.join(__dirname, "temp", `session_${num}`);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(tempDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      // "Logging in..." එක හිර නොවී ක්ෂණිකව handshake එක complete වීමට Ubuntu Chrome යොදන්න
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      emitOwnEvents: true,
      fireInitQueries: true,
      generateHighQualityLinkPreview: true
    });

    sock.ev.on("creds.update", saveCreds);

    let hasResponded = false;

    // Code එක request කිරීම
    setTimeout(async () => {
      if (!sock.authState.creds.registered && !hasResponded) {
        try {
          const rawCode = await sock.requestPairingCode(num);
          const formattedCode = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
          hasResponded = true;
          return res.json({ code: formattedCode });
        } catch (err) {
          console.error("Code Generation Error:", err.message);
          if (!hasResponded) {
            hasResponded = true;
            return res.status(500).json({ error: "Code generation timeout. Please retry." });
          }
        }
      }
    }, 4000); // Server handshake එකට තත්පර 4ක් සම්පූර්ණයෙන් ලබා දීම

    // WhatsApp Authentication Event
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        console.log(`✅ Handshake complete. Connected to WhatsApp!`);
        await delay(3000);

        try {
          const credsPath = path.join(tempDir, "creds.json");
          if (fs.existsSync(credsPath)) {
            const rawCreds = fs.readFileSync(credsPath, "utf-8");
            const b64 = Buffer.from(rawCreds).toString("base64");
            const sessionId = `NETH-UXMD~${b64}`;

            const userJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const sessionText = `👑 *QUEEN NETHU MD - LOGIN SUCCESS* 👑\n\n` +
              `*Session Key:*\n\`\`\`${sessionId}\`\`\`\n\n` +
              `⚠️ _මෙම Session ID එක සුරක්ෂිතව තබාගන්න._`;

            await sock.sendMessage(userJid, { text: sessionText });
          }
        } catch (e) {
          console.error("Session dispatch error:", e.message);
        } finally {
          await delay(2000);
          await sock.end();
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }

      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`Connection closed with code: ${reason}`);
      }
    });

  } catch (err) {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to initialize socket." });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Queen Nethu Server running on port ${PORT}`);
});
