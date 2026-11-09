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

module.exports = {
  name: "tt",
  description: "Download TikTok videos or send directly to Channel",
  execute: async (sock, msg, from, args, { registerReply }) => {
    const rawText =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
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
      const response = await axios.get(apiUrl, { timeout: 30000 });
      const resData = response.data;
      const data = resData?.result || resData?.data || resData;

      if (!data) {
        throw new Error("API එකෙන් දත්ත ලබා ගැනීමට නොහැකි විය.");
      }

      const hdVideo = data.hdplay || data.play || data.nowm;
      const sdVideo = data.play || data.nowm || hdVideo;
      const audioUrl = data.music || data.audio || data.music_info?.play;
      const rawTitle = data.title || data.desc || "TikTok Video";
      const cleanedTitle = cleanTitle(rawTitle);
      const author = data.author?.nickname || data.author?.unique_id || "TikTok User";

      // -------------------------------------------------------------
      // 🚀 1. .ctt Command (Direct Channel Send)
      // -------------------------------------------------------------
      if (isChannel) {
        const downloadUrl = hdVideo || sdVideo;
        if (!downloadUrl) throw new Error("Video link එක හමු නොවීය.");

        await sock.sendMessage(TARGET_CHANNEL_JID, {
          video: { url: downloadUrl },
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
      // 🚀 2. .tt Command (Interactive Menu & 1, 2, 3 Register)
      // -------------------------------------------------------------
      const menuText = `🎵 *QUEEN NETHU MD TIKTOK DOWNLOADER* 🎵

📝 *Title:* ${cleanedTitle}
👤 *Author:* ${author}

*පහතින් ඔබට අවශ්‍ය Format එක තෝරා අංකය Reply කරන්න:*

  *1* ➜ HD Video 🎬
  *2* ➜ SD Video 📱
  *3* ➜ Voice Note (Audio) 🎧

_කරුණාකර 1, 2, හෝ 3 ලෙස Reply කරන්න._`;

      const menuMsg = await sock.sendMessage(
        from,
        { text: menuText },
        { quoted: msg }
      );

      const sender = msg.key.participant || from;

      registerReply(from, sender, menuMsg.key.id, {
        "1": async (s, m, f) => {
          const url = hdVideo || sdVideo;
          await s.sendMessage(
            f,
            {
              video: { url },
              caption: `🎬 *${cleanedTitle}* (HD Quality)\n👑 QUEEN NETHU MD`,
              mimetype: "video/mp4"
            },
            { quoted: m }
          );
          await s.sendMessage(f, { react: { text: "✅", key: m.key } }).catch(() => {});
        },
        "2": async (s, m, f) => {
          const url = sdVideo || hdVideo;
          await s.sendMessage(
            f,
            {
              video: { url },
              caption: `📱 *${cleanedTitle}* (SD Quality)\n👑 QUEEN NETHU MD`,
              mimetype: "video/mp4"
            },
            { quoted: m }
          );
          await s.sendMessage(f, { react: { text: "✅", key: m.key } }).catch(() => {});
        },
        "3": async (s, m, f) => {
          if (!audioUrl) throw new Error("Audio URL හමු නොවීය.");
          await s.sendMessage(
            f,
            {
              audio: { url: audioUrl },
              mimetype: "audio/mp4",
              ptt: true
            },
            { quoted: m }
          );
          await s.sendMessage(f, { react: { text: "✅", key: m.key } }).catch(() => {});
        }
      });

    } catch (err) {
      console.error("TikTok Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
      await sock.sendMessage(
        from,
        { text: `❌ *TikTok download කිරීම අසාර්ථක විය:*\n_${err.message}_` },
        { quoted: msg }
      );
    }
  }
};
