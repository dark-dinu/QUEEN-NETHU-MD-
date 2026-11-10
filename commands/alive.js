const fs = require("fs");
const path = require("path");
const os = require("os");

// ⚡ Global In-Memory Image Cache (එක පාරක් පමණක් RAM එකට load වේ)
global.cachedAliveLogo = global.cachedAliveLogo || null;

function loadLogoToMemory() {
  if (global.cachedAliveLogo) return global.cachedAliveLogo;

  const possiblePaths = [
    path.join(__dirname, "../ping.png"),
    path.join(__dirname, "../assets/ping.png"),
    path.join(__dirname, "../media/ping.png"),
    path.join(process.cwd(), "ping.png")
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        global.cachedAliveLogo = fs.readFileSync(p);
        return global.cachedAliveLogo;
      } catch (_) {}
    }
  }

  // File එක නැතිනම් Fast URL fallback
  global.cachedAliveLogo = { url: "https://files.catbox.moe/k315x4.jpg" };
  return global.cachedAliveLogo;
}

// Bot එක run වෙද්දීම cache එකට load කර තබා ගැනීම
loadLogoToMemory();

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

module.exports = {
  name: "alive",
  aliases: ["bot", "info", "system"],
  description: "Check bot online status and system metrics instantly",

  execute: async (sock, msg, from) => {
    // ⚡ 1. Reaction එක Background එකේ දුවවන්න (await කරලා delay කරන්නේ නැත)
    sock.sendMessage(from, { react: { text: "👸🏻", key: msg.key } }).catch(() => {});

    // ⚡ 2. Quick System Metrics
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
> ⚡ *Speed:* Realtime Direct
> ━━━━━━━━━━━━━━━━
 
> *“Always listening, always serving with grace.”*
 
> ━━━━━━━━━━━━━━━━
> *♡ ᴍᴀᴅᴇ ᴡɪᴛʜ ʜᴇꜱʜᴀɴ ♡*`;

    // ⚡ 3. Direct Memory Cache එකෙන් ක්ෂණිකව send කිරීම
    const logoData = global.cachedAliveLogo || loadLogoToMemory();

    return await sock.sendMessage(
      from,
      {
        image: logoData,
        caption: aliveCaption
      },
      { quoted: msg }
    );
  }
};
