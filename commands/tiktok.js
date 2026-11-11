const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

let ffmpegPath = "ffmpeg";
try {
  const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
  ffmpegPath = ffmpegInstaller?.path || "ffmpeg";
} catch (_) {
  ffmpegPath = "ffmpeg";
}

// Global In-Memory Fast Lookup Maps
global.ttCache = global.ttCache || new Map();
global.ttHookedSockets = global.ttHookedSockets || new WeakSet();

// ඔබගේ Target WhatsApp Channel JID එක
const TARGET_CHANNEL_JID = "120363383020614051@newsletter";

// Title එකෙන් #hashtags සහ @mentions ඉවත් කර clean title එකක් ගැනීම
function cleanTitle(text) {
  if (!text) return "TikTok Video";
  return text
    .replace(/#\S+/g, "")
    .replace(/@\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNumber(num) {
  if (!num) return "10.5K";
  const n = Number(num);
  if (isNaN(n)) return num;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

function convertToOpusVoice(inputBuffer) {
  return new Promise((resolve) => {
    const tempId = `${Date.now()}_${(Math.random() * 1e9) | 0}`;
    const tempIn = path.join(os.tmpdir(), `ttin_${tempId}.mp3`);
    const tempOut = path.join(os.tmpdir(), `ttout_${tempId}.ogg`);

    fs.writeFile(tempIn, inputBuffer, (writeErr) => {
      if (writeErr) return resolve(inputBuffer);

      const cmd = `"${ffmpegPath}" -y -i "${tempIn}" -c:a libopus -b:a 64k -ar 48000 -ac 1 "${tempOut}"`;
      exec(cmd, (execErr) => {
        safeUnlink(tempIn);
        if (execErr) return resolve(inputBuffer);

        fs.readFile(tempOut, (readErr, outBuf) => {
          safeUnlink(tempOut);
          if (readErr || !outBuf) return resolve(inputBuffer);
          resolve(outBuf);
        });
      });
    });
  });
}

// Low-latency Stream Downloader
async function fetchStreamBuffer(streamUrl) {
  try {
    const res = await axios.get(streamUrl, {
      responseType: "arraybuffer",
      timeout: 45000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    return Buffer.from(res.data);
  } catch (_) {
    return null;
  }
}

// Multi-Engine TikTok Scraper
async function fetchTikTokMetadata(targetUrl) {
  // Engine 1: Chamindu API
  try {
    const apiKey = "chama_api_9c55e3c6d014abbdf65054f9046a920b";
    const res1 = await axios.get(
      `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(targetUrl)}&api_key=${apiKey}`,
      { timeout: 15000 }
    );
    const d = res1.data?.result || res1.data?.data;
    if (d) {
      const dl = d.downloads || {};
      return {
        title: cleanTitle(d.title || d.desc),
        author: d.author?.nickname || d.author?.unique_id || "TikTok User",
        views: formatNumber(d.statistics?.play_count || d.play_count || d.views),
        cover: d.origin_cover || d.cover || d.cover_url,
        hd: dl.no_watermark_hd || d.hdplay || d.play_hd || dl.no_watermark || d.play,
        sd: dl.no_watermark_sd || d.play || dl.no_watermark || d.wmplay,
        audio: dl.audio || d.music || d.audio || d.music_info?.play_url
      };
    }
  } catch (_) {}

  // Engine 2: TikWM Public Cloud
  try {
    const res2 = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, { timeout: 12000 });
    if (res2.data?.data) {
      const d2 = res2.data.data;
      return {
        title: cleanTitle(d2.title),
        author: d2.author?.nickname || d2.author?.unique_id || "TikTok User",
        views: formatNumber(d2.play_count || d2.views),
        cover: d2.cover,
        hd: d2.hdplay || d2.play,
        sd: d2.play,
        audio: d2.music
      };
    }
  } catch (_) {}

  return null;
}

function cleanJid(jid = "") {
  return jid.split("@")[0].split(":")[0];
}

// Low-latency Reply Hook Engine
function attachTikTokReplyEngine(sock) {
  if (!sock || global.ttHookedSockets.has(sock)) return;
  global.ttHookedSockets.add(sock);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const m = messages[0];
    if (!m?.message) return;

    const from = m.key.remoteJid;
    if (!from || from === "status@broadcast") return;

    const rawMsg =
      m.message.ephemeralMessage?.message ||
      m.message.viewOnceMessage?.message ||
      m.message.viewOnceMessageV2?.message ||
      m.message;

    const contextInfo =
      rawMsg?.extendedTextMessage?.contextInfo ||
      rawMsg?.imageMessage?.contextInfo ||
      rawMsg?.videoMessage?.contextInfo;

    const quotedId = contextInfo?.stanzaId;
    if (!quotedId || !global.ttCache.has(quotedId)) return;

    const session = global.ttCache.get(quotedId);
    if (cleanJid(session.chat) !== cleanJid(from)) return;

    const choice = (
      rawMsg.conversation ||
      rawMsg.extendedTextMessage?.text ||
      ""
    ).trim();

    if (choice !== "1" && choice !== "2" && choice !== "3") return;

    if (session.isProcessing) return;
    session.isProcessing = true;
    global.ttCache.delete(quotedId);

    sock.sendMessage(from, { react: { text: "🌸", key: m.key } }).catch(() => {});

    try {
      let downloadUrl = "";
      let isAudio = false;

      if (choice === "1") downloadUrl = session.hd || session.sd;
      else if (choice === "2") downloadUrl = session.sd || session.hd;
      else if (choice === "3") {
        downloadUrl = session.audio;
        isAudio = true;
      }

      if (!downloadUrl) throw new Error("තෝරාගත් මාධ්‍ය සබැඳිය ලබාගත නොහැක.");

      const streamBuffer = await fetchStreamBuffer(downloadUrl);

      const aestheticDeliveryCaption = 
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 👸🏻*
> ━━━━━━━━━━━━━━━━
> 📝 *Title:* ${session.title}
> 🎬 *Quality:* ${choice === "1" ? "1080p Ultra HD" : choice === "2" ? "720p Standard" : "HQ Audio Track"}
> ⚡ *Speed:* Realtime Direct Stream
> ━━━━━━━━━━━━━━━━`;

      if (isAudio) {
        if (streamBuffer) {
          const pttBuffer = await convertToOpusVoice(streamBuffer);
          await sock.sendMessage(
            from,
            {
              audio: pttBuffer,
              mimetype: "audio/ogg; codecs=opus",
              ptt: true
            },
            { quoted: m }
          );
        } else {
          await sock.sendMessage(
            from,
            {
              audio: { url: downloadUrl },
              mimetype: "audio/mp4",
              ptt: true
            },
            { quoted: m }
          );
        }
      } else {
        if (streamBuffer) {
          await sock.sendMessage(
            from,
            {
              video: streamBuffer,
              caption: aestheticDeliveryCaption,
              mimetype: "video/mp4"
            },
            { quoted: m }
          );
        } else {
          await sock.sendMessage(
            from,
            {
              video: { url: downloadUrl },
              caption: aestheticDeliveryCaption,
              mimetype: "video/mp4"
            },
            { quoted: m }
          );
        }
      }

      sock.sendMessage(from, { react: { text: "✅", key: m.key } }).catch(() => {});
    } catch (err) {
      console.error("[TIKTOK STREAM ERROR]:", err.message);
      sock.sendMessage(from, { react: { text: "❌", key: m.key } }).catch(() => {});
      sock.sendMessage(
        from,
        { text: `❌ *බාගත කිරීම අසාර්ථක විය:* (${err.message})` },
        { quoted: m }
      ).catch(() => {});
    }
  });
}

module.exports = {
  name: "tt",
  aliases: ["tiktok", "tikdl", "ttdl"],
  description: "Download TikTok HD/SD videos and audio via aesthetic reply menu",

  execute: async (sock, msg, from, args) => {
    attachTikTokReplyEngine(sock);

    const rawText =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";
    const isChannel = rawText.trim().startsWith(".ctt");
    const url = args[0]?.trim();

    if (!url || (!url.includes("tiktok.com") && !url.includes("vt.tiktok.com"))) {
      sock.sendMessage(from, { react: { text: "⚠️", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        {
          text: 
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 👸🏻*
> ━━━━━━━━━━━━━━━━
> 📝 *Usage:* \`.tt <tiktok_link>\`
> 📢 *Channel:* \`.ctt <tiktok_link>\`
> ━━━━━━━━━━━━━━━━`
        },
        { quoted: msg }
      );
    }

    sock.sendMessage(from, { react: { text: "🌸", key: msg.key } }).catch(() => {});

    try {
      const meta = await fetchTikTokMetadata(url);
      if (!meta) {
        sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
        return await sock.sendMessage(
          from,
          { text: "❌ *TikTok වීඩියෝව හමු නොවීය!* Link එක Public දැයි පරීක්ෂා කරන්න." },
          { quoted: msg }
        );
      }

      // -------------------------------------------------------------
      // 🚀 1. .ctt Command (Channel Fix: Buffer Direct Push)
      // -------------------------------------------------------------
      if (isChannel) {
        const downloadUrl = meta.hd || meta.sd;
        if (!downloadUrl) throw new Error("Video download link හමු නොවීය.");

        await sock.sendMessage(from, { text: "📤 *Video එක Channel එකට යවමින් පවතී...*" }, { quoted: msg });

        const videoBuf = await fetchStreamBuffer(downloadUrl);
        if (!videoBuf) throw new Error("Video buffer එක බාගත කිරීම අසාර්ථක විය.");

        // WhatsApp Channel එකට කිසිදු # tag එකක් නැතිව පිරිසිදු මාතෘකාව සමඟ යැවීම
        await sock.sendMessage(TARGET_CHANNEL_JID, {
          video: videoBuf,
          caption: meta.title,
          mimetype: "video/mp4"
        });

        sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
        return await sock.sendMessage(
          from,
          { text: `✅ *සාර්ථකව Channel එකට යවන ලදී!*\n\n📝 *Title:* ${meta.title}` },
          { quoted: msg }
        );
      }

      // -------------------------------------------------------------
      // 🚀 2. .tt Command (Clean, VIP Aesthetic Card)
      // -------------------------------------------------------------
      const caption = 
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 👸🏻*
> ━━━━━━━━━━━━━━━━
> 📝 *Title:* ${meta.title}
> 👤 *Creator:* @${meta.author}
> 👁️ *Views:* ${meta.views}
> ━━━━━━━━━━━━━━━━
 
> *1* ➜ 🎬 HD Video (1080p No Watermark)
> *2* ➜ 📱 SD Video (Fast & Light)
> *3* ➜ 🎙️ Voice Note (PTT Audio)

> ━━━━━━━━━━━━━━━━
> _Reply with *1*, *2*, or *3* to download_`;

      const coverUrl = meta.cover || "https://files.catbox.moe/k315x4.jpg";
      const sentMsg = await sock.sendMessage(
        from,
        {
          image: { url: coverUrl },
          caption
        },
        { quoted: msg }
      );

      const messageId = sentMsg?.key?.id;
      if (messageId) {
        global.ttCache.set(messageId, {
          chat: from,
          hd: meta.hd,
          sd: meta.sd,
          audio: meta.audio,
          title: meta.title,
          isProcessing: false
        });

        setTimeout(() => {
          global.ttCache.delete(messageId);
        }, 300000);
      }

      sock.sendMessage(from, { react: { text: "✨", key: msg.key } }).catch(() => {});
    } catch (err) {
      console.error("[TIKTOK ERROR]:", err.message);
      sock.sendMessage(from, { react: { text: "⚠️", key: msg.key } }).catch(() => {});
      await sock.sendMessage(
        from,
        { text: `❌ *දෝෂයක් සිදුවිය:* (${err.message})` },
        { quoted: msg }
      );
    }
  }
};
