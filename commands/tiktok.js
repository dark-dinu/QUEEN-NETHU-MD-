const axios = require("axios");

// Interactive session store (RAM cache)
const ttSessions = new Map();

// Channel JID derived from link: https://whatsapp.com/channel/0029VbBTkLI9Gv7bXpWEmg3D
const TARGET_CHANNEL_JID = "120363383020614051@newsletter";
const API_KEY = "chama_api_9c55e3c6d014abbdf65054f9046a920b";

// Hashtags (#) සහ අනවශ්‍ය spaces අයින් කර Title එක clean කිරීම
function cleanTitle(text) {
  if (!text) return "TikTok Video";
  return text
    .replace(/#\S+/g, "") // Remove all #hashtags
    .replace(/\s+/g, " ") // Clean double spaces
    .trim();
}

module.exports = {
  name: "tt",
  description: "Download TikTok videos or send directly to Channel",
  execute: async (sock, msg, from, args) => {
    // Message එකෙන් command එක ලබා ගැනීම (.tt ද .ctt ද කියලා හඳුනාගන්න)
    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";
    const isChannelCmd = body.startsWith(".ctt");
    const url = args[0];

    if (!url || (!url.includes("tiktok.com") && !url.includes("vt.tiktok.com"))) {
      return await sock.sendMessage(
        from,
        { text: `⚠️ කරුණාකර වලංගු TikTok Video Link එකක් ලබා දෙන්න!\n\n*භාවිතය:*\n.tt <link>\n.ctt <link> (Forward to Channel)` },
        { quoted: msg }
      );
    }

    const waitMsg = await sock.sendMessage(
      from,
      { text: "⏳ *TikTok දත්ත ලබා ගනිමින් පවතී... කරුණාකර රැඳී සිටින්න.*" },
      { quoted: msg }
    );

    try {
      const apiUrl = `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(url)}&api_key=${API_KEY}`;
      const res = await axios.get(apiUrl, { timeout: 30000 });
      const data = res.data?.result || res.data?.data || res.data;

      if (!data) {
        throw new Error("API එකෙන් දත්ත ලබා ගැනීමට නොහැකි විය.");
      }

      // API එකෙන් එන links extract කරගැනීම
      const hdVideo = data.hdplay || data.hd_play || data.play_hd || data.play || data.nowm;
      const sdVideo = data.play || data.wmplay || data.nowm || hdVideo;
      const audioUrl = data.music || data.audio || data.music_info?.play;
      const rawTitle = data.title || data.desc || "TikTok Video";
      const cleanVideoTitle = cleanTitle(rawTitle);

      // -------------------------------------------------------------
      // 🚀 1. .ctt Command (Direct Channel Send without Hashtags)
      // -------------------------------------------------------------
      if (isChannelCmd) {
        const downloadUrl = hdVideo || sdVideo;
        if (!downloadUrl) throw new Error("Video download link එක හමු නොවීය.");

        await sock.sendMessage(
          from,
          { text: "📤 *Video එක Channel එකට යවමින් පවතී...*", edit: waitMsg.key }
        );

        // Send straight to WhatsApp Channel (Newsletter)
        await sock.sendMessage(TARGET_CHANNEL_JID, {
          video: { url: downloadUrl },
          caption: cleanVideoTitle,
          mimetype: "video/mp4"
        });

        return await sock.sendMessage(
          from,
          { text: `✅ *සාර්ථකව Channel එකට යවන ලදී!*\n\n📝 *Title:* ${cleanVideoTitle}`, edit: waitMsg.key }
        );
      }

      // -------------------------------------------------------------
      // 🚀 2. .tt Command (Interactive 1, 2, 3 Selection Menu)
      // -------------------------------------------------------------
      const menuText = `🎵 *QUEEN NETHU MD TIKTOK DOWNLOADER* 🎵

📝 *Title:* ${cleanVideoTitle}
👤 *Author:* ${data.author?.nickname || data.author?.unique_id || "TikTok User"}

*පහතින් ඔබට අවශ්‍ය Format එක තෝරා අංකය Reply කරන්න:*

  *1* ➜ HD Video 🎬
  *2* ➜ SD Video 📱
  *3* ➜ Voice Note (Audio) 🎧

_කරුණාකර මෙම පණිවිඩයට 1, 2, හෝ 3 ලෙස reply කරන්න._`;

      const menuMsg = await sock.sendMessage(
        from,
        { text: menuText, edit: waitMsg.key }
      );

      // Reply එක capture කිරීමට session එකක් store කිරීම (තත්පර 120 ක් වලංගුයි)
      const sessionKey = `${from}_${msg.key.participant || from}`;
      ttSessions.set(sessionKey, {
        msgId: menuMsg.key.id,
        hdVideo,
        sdVideo,
        audioUrl,
        title: cleanVideoTitle,
        timer: setTimeout(() => ttSessions.delete(sessionKey), 120000)
      });

    } catch (err) {
      console.error("TikTok Error:", err.message);
      await sock.sendMessage(
        from,
        { text: `❌ *TikTok download කිරීම අසාර්ථක විය.* (${err.message})`, edit: waitMsg.key }
      );
    }
  },

  // 1, 2, 3 reply එක handle කිරීමට export කරන listener handler එක
  handleReply: async (sock, msg, from, body) => {
    const sessionKey = `${from}_${msg.key.participant || from}`;
    if (!ttSessions.has(sessionKey)) return false;

    const session = ttSessions.get(sessionKey);
    const choice = body.trim();

    if (!["1", "2", "3"].includes(choice)) return false;

    clearTimeout(session.timer);
    ttSessions.delete(sessionKey);

    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

    try {
      if (choice === "1") {
        // HD Video
        const link = session.hdVideo || session.sdVideo;
        await sock.sendMessage(
          from,
          {
            video: { url: link },
            caption: `🎬 *${session.title}* (HD Quality)\n👑 QUEEN NETHU MD`,
            mimetype: "video/mp4"
          },
          { quoted: msg }
        );
      } else if (choice === "2") {
        // SD Video
        const link = session.sdVideo || session.hdVideo;
        await sock.sendMessage(
          from,
          {
            video: { url: link },
            caption: `📱 *${session.title}* (SD Quality)\n👑 QUEEN NETHU MD`,
            mimetype: "video/mp4"
          },
          { quoted: msg }
        );
      } else if (choice === "3") {
        // Voice Note (PTT)
        if (!session.audioUrl) throw new Error("Audio හමු නොවීය.");
        await sock.sendMessage(
          from,
          {
            audio: { url: session.audioUrl },
            mimetype: "audio/mp4",
            ptt: true // Voice note එකක් ලෙස send වේ
          },
          { quoted: msg }
        );
      }

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      return true;
    } catch (err) {
      console.error("Reply Download Error:", err);
      await sock.sendMessage(from, { text: `❌ File එක එවීමේදී දෝෂයක් සිදුවිය: ${err.message}` }, { quoted: msg });
      return true;
    }
  }
};
