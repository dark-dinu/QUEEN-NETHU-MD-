const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require("../config");

// Uptime Formatter (D:H:M:S)
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

// Local Logo Loader (ping.png)
function getAliveLogo() {
  const possiblePaths = [
    path.join(__dirname, "../ping.png"),
    path.join(__dirname, "../assets/ping.png"),
    path.join(__dirname, "../media/ping.png"),
    path.join(process.cwd(), "ping.png")
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }
  // Local file නැතිනම් fallback URL
  return { url: "https://files.catbox.moe/k315x4.jpg" };
}

module.exports = {
  name: "alive",
  aliases: ["bot", "info", "system"],
  description: "Check bot online status and system metrics",

  execute: async (sock, msg, from) => {
    await sock.sendMessage(from, { react: { text: "👸🏻", key: msg.key } }).catch(() => {});

    // System Metrics
    const uptime = formatUptime(process.uptime());
    const usedRam = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const platform = os.platform();

    const aliveCaption = 
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 𝐌𝐃*
> ━━━━━━━━━━━━━━━━
> 👑 *Status:* Online & Active
> ⏳ *Uptime:* ${uptime}
> 💾 *RAM:* ${usedRam} MB / ${totalRam} GB
> ⚙️ *Platform:* ${platform}
> ⚡ *Speed:* 100% Operational
> ━━━━━━━━━━━━━━━━
> 
> *“Always listening, always serving with grace.”*
> 
> ━━━━━━━━━━━━━━━━
> *♡ ᴍᴀᴅᴇ ᴡɪᴛʜ ʜᴇꜱʜᴀɴ ♡*`;

    try {
      const logoData = getAliveLogo();
      const payload = Buffer.isBuffer(logoData)
        ? { image: logoData, caption: aliveCaption }
        : { image: logoData, caption: aliveCaption };

      return await sock.sendMessage(from, payload, { quoted: msg });
    } catch (err) {
      console.error("[ALIVE ERROR]:", err.message);
      return await sock.sendMessage(
        from,
        { text: aliveCaption },
        { quoted: msg }
      );
    }
  }
};
