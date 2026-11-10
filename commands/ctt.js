const axios = require("axios");

const API_KEY = "chama_api_9c55e3c6d014abbdf65054f9046a920b";
const CHANNEL_INVITE_CODE = "0029VbBTkLI9Gv7bXpWEmg3D";
const FALLBACK_CHANNEL_JID = "120363383020614051@newsletter";

// Title එකේ ඇති සියලුම #hashtags සහ @mentions ඉවත් කර පිරිසිදු කිරීම
function cleanTitle(text) {
  if (!text) return "TikTok Video";
  return text
    .replace(/#\S+/g, "")
    .replace(/@\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Media URL එක Buffer එකක් ලෙස Download කරගැනීම
async function fetchStreamBuffer(streamUrl) {
  try {
    const res = await axios.get(streamUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    return Buffer.from(res.data);
  } catch (err) {
    console.error("Stream Fetch Error:", err.message);
    return null;
  }
}

// Multi-Engine Scraper (Chamindu -> TikWM -> BK9)
async function fetchTikTokData(targetUrl) {
  // Engine 1: Chamindu API
  try {
    const res1 = await axios.get(
      `https://api.chamindu.site/api/v1/tiktok?url=${encodeURIComponent(targetUrl)}&api_key=${API_KEY}`,
      { timeout: 15000 }
    );
    const d = res1.data?.result || res1.data?.data;
    if (d) {
      const dl = d.downloads || {};
      const videoUrl = dl.no_watermark_hd || d.hdplay || d.play_hd || dl.no_watermark || d.play;
      if (videoUrl) {
        return {
          title: cleanTitle(d.title || d.desc),
          videoUrl
        };
      }
    }
  } catch (_) {}

  // Engine 2: TikWM
  try {
    const res2 = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
      timeout: 12000
    });
    if (res2.data?.data) {
      const d2 = res2.data.data;
      return {
        title: cleanTitle(d2.title),
        videoUrl: d2.hdplay || d2.play
      };
    }
  } catch (_) {}

  // Engine 3: BK9
  try {
    const res3 = await axios.get(`https://bk9.fun/download/tiktok?url=${encodeURIComponent(targetUrl)}`, {
      timeout: 12000
    });
    if (res3.data?.BK9) {
      const d3 = res3.data.BK9;
      return {
        title: cleanTitle(d3.desc),
        videoUrl: d3.HD || d3.nowm
      };
    }
  } catch (_) {}

  return null;
}

module.exports = {
  name: "ctt",
  aliases: ["channeltiktok", "ttchannel"],
  description: "Download and forward TikTok video directly to WhatsApp Channel",

  execute: async (sock, msg, from, args) => {
    const url = args[0]?.trim();

    if (!url || (!url.includes("tiktok.com") && !url.includes("vt.tiktok.com"))) {
      await sock.sendMessage(from, { react: { text: "⚠️", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        {
          text:
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 👸🏻*
> ━━━━━━━━━━━━━━━━
> 📝 *Usage:* \`.ctt <tiktok_video_url>\`
> 📢 *Target:* WhatsApp Channel
> ━━━━━━━━━━━━━━━━`
        },
        { quoted: msg }
      );
    }

    // Reaction & Message 1: Initial Processing Message
    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});
    await sock.sendMessage(
      from,
      { text: "⏳ *Processing your request... Forwarding video to Channel.*" },
      { quoted: msg }
    );

    try {
      // 1. Data Scraping
      const data = await fetchTikTokData(url);
      if (!data || !data.videoUrl) {
        throw new Error("Could not retrieve TikTok download stream.");
      }

      // 2. Video Buffer Download
      const videoBuffer = await fetchStreamBuffer(data.videoUrl);
      if (!videoBuffer) {
        throw new Error("Failed to download video buffer.");
      }

      // 3. Resolve Channel Newsletter JID Live
      let targetJid = FALLBACK_CHANNEL_JID;
      try {
        if (typeof sock.newsletterMetadata === "function") {
          const meta = await sock.newsletterMetadata("invite", CHANNEL_INVITE_CODE);
          if (meta?.id) {
            targetJid = meta.id;
          }
        }
      } catch (metaErr) {
        console.log("Metadata resolve fallback to static JID:", metaErr.message);
      }

      // 4. Send to WhatsApp Channel with English Caption (No Hashtags)
      await sock.sendMessage(targetJid, {
        video: videoBuffer,
        caption: data.title,
        mimetype: "video/mp4"
      });

      // Reaction & Message 2: Final Success Message
      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        {
          text:
`> ✅ *Video Forwarded Successfully!*
> 📝 *Title:* ${data.title}

> *𝗤𝗨𝗘𝗘𝗡 𝗡𝗘𝗧𝗛𝗨 👸🏻*`
        },
        { quoted: msg }
      );

    } catch (err) {
      console.error("[CTT ERROR]:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        { text: `❌ *Failed to forward to channel:* (${err.message})` },
        { quoted: msg }
      );
    }
  }
};
