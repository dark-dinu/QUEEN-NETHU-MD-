const axios = require("axios");

const API_KEY = "chama_api_9c55e3c6d014abbdf65054f9046a920b";
const TARGET_CHANNEL_JID = "120363383020614051@newsletter"; // https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D

function cleanTitle(text) {
  if (!text) return "TikTok Video";
  return text
    .replace(/#\S+/g, "")
    .replace(/@\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getBuffer(url) {
  const res = await axios({
    method: "get",
    url,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    responseType: "arraybuffer",
    timeout: 60000
  });
  return Buffer.from(res.data);
}

module.exports = {
  name: "tt",
  description: "Download TikTok videos or send directly to Channel",
  execute: async (sock, msg, from, args, { registerReply }) => {
    const rawText =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";
    const isChannel = rawText.trim().startsWith(".ctt");
    const inputUrl = args[0];

    if (!inputUrl || (!inputUrl.includes("tiktok.com") && !inputUrl.includes("vt.tiktok.com"))) {
      return await sock.sendMessage(
        from,
        { text: "⚠️ *කරුණාකර වලංගු TikTok Video Link එකක් ලබා දෙන්න!*\n\n*භාවිතය:*\n.tt <link>\n.ctt <link> (Forward to Channel)" },
        { quoted: msg }
      );
    }

    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});

    try {
      const apiUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(inputUrl)}&api_key=${API_KEY}`;
      const response = await axios.get(apiUrl, { timeout: 35000 });
      const resData = response.data;
      const data = resData?.result || resData?.data || resData;

      if (!data) throw new Error("API එකෙන් දත්ත ලැබුණේ නැත.");

      const hdVideo = data.hdplay || data.play_hd || data.play || data.nowm;
      const sdVideo = data.play || data.nowm || data.wmplay || hdVideo;
      const audioUrl = data.music || data.audio || data.music_info?.play;
      const rawTitle = data.title || data.desc || "TikTok Video";
      const cleanedTitle = cleanTitle(rawTitle);
      const author = data.author?.nickname || data.author?.unique_id || "TikTok User";

      // -------------------------------------------------------------
      // 🚀 1. .ctt Command (Direct Channel Send)
      // -------------------------------------------------------------
      if (isChannel) {
        const targetVideoUrl = hdVideo || sdVideo;
        if (!targetVideoUrl) throw new Error("Video download link හමු නොවීය.");

        const videoBuffer = await getBuffer(targetVideoUrl);

        await sock.sendMessage(TARGET_CHANNEL_JID, {
          video: videoBuffer,
          caption: cleanedTitle,
          mimetype: "video/mp4"
        });

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
        return await sock.sendMessage(
          from,
          { text: `✅ *සාර්ථකව Channel එකට යවන ලදී!*\n\n📝 *Title:* ${cleanedTitle}` },
          { quoted: msg }
        );
      }

      // -------------------------------------------------------------
      // 🚀 2. .tt Command (Interactive Menu)
      // -------------------------------------------------------------
      const menuText = `🎵 *QUEEN NETHU MD TIKTOK DOWNLOADER* 🎵

📝 *Title:* ${cleanedTitle}
👤 *Author:* ${author}

*පහතින් ඔබට අවශ්‍ය Format එක තෝරා අංකය Reply කරන්න:*

  *1* ➜ HD Video 🎬
  *2* ➜ SD Video 📱
  *3* ➜ Voice Note (Audio) 🎧

_කරුණාකර 1, 2, හෝ 3 ලෙස මෙම පණිවිඩයට Reply කරන්න._`;

      const menuMsg = await sock.sendMessage(
        from,
        { text: menuText },
        { quoted: msg }
      );

      // JID එක String එකක් ලෙස නිවැරදිව ලබා ගැනීම
      const senderJid = String(msg.key.participant || (msg.key.fromMe ? sock.user?.id : from) || from);

      // Central Reply Handler එකට actions ලියාපදිංචි කිරීම
      registerReply(from, senderJid, menuMsg.key.id, {
        "1": async (s, m, f) => {
          const vUrl = hdVideo || sdVideo;
          if (!vUrl) throw new Error("HD Video link හමු නොවීය.");
          const buf = await getBuffer(vUrl);
          await s.sendMessage(
            f,
            {
              video: buf,
              caption: `🎬 *${cleanedTitle}* (HD Quality)\n👑 QUEEN NETHU MD`,
              mimetype: "video/mp4"
            },
            { quoted: m }
          );
          await s.sendMessage(f, { react: { text: "✅", key: m.key } }).catch(() => {});
        },
        "2": async (s, m, f) => {
          const vUrl = sdVideo || hdVideo;
          if (!vUrl) throw new Error("SD Video link හමු නොවීය.");
          const buf = await getBuffer(vUrl);
          await s.sendMessage(
            f,
            {
              video: buf,
              caption: `📱 *${cleanedTitle}* (SD Quality)\n👑 QUEEN NETHU MD`,
              mimetype: "video/mp4"
            },
            { quoted: m }
          );
          await s.sendMessage(f, { react: { text: "✅", key: m.key } }).catch(() => {});
        },
        "3": async (s, m, f) => {
          if (!audioUrl) throw new Error("Audio URL හමු නොවීය.");
          const aBuf = await getBuffer(audioUrl);
          await s.sendMessage(
            f,
            {
              audio: aBuf,
              mimetype: "audio/mp4",
              ptt: true
            },
            { quoted: m }
          );
          await s.sendMessage(f, { react: { text: "✅", key: m.key } }).catch(() => {});
        }
      });

    } catch (err) {
      console.error("TikTok Handler Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
      await sock.sendMessage(
        from,
        { text: `❌ *TikTok download කිරීම අසාර්ථක විය:*\n_${err.message}_` },
        { quoted: msg }
      );
    }
  }
};
