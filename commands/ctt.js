const axios = require("axios");

const API_KEY = "chama_api_9c55e3c6d014abbdf65054f9046a920b";
const CHANNEL_INVITE_CODE = "0029VbBTkLI9Gv7bXpWEmg3D";
let cachedChannelJid = null;

// Clean Title - #tags සහ @mentions ඉවත් කිරීම
function cleanTitle(text) {
  if (!text) return "TikTok Video";
  return text
    .replace(/#\S+/g, "")
    .replace(/@\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Low-latency Stream Downloader
async function fetchStreamBuffer(streamUrl) {
  try {
    const res = await axios.get(streamUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: 100 * 1024 * 1024,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.tiktok.com/"
      }
    });
    return Buffer.from(res.data);
  } catch (err) {
    console.error("[STREAM FETCH ERROR]:", err.message);
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

// Channel JID Live Resolution
async function getChannelJid(sock) {
  if (cachedChannelJid) return cachedChannelJid;
  try {
    if (typeof sock.newsletterMetadata === "function") {
      const meta = await sock.newsletterMetadata("invite", CHANNEL_INVITE_CODE);
      if (meta?.id) {
        cachedChannelJid = meta.id.includes("@newsletter") ? meta.id : `${meta.id}@newsletter`;
        return cachedChannelJid;
      }
    }
  } catch (err) {
    console.error("[CHANNEL META ERROR]:", err.message);
  }
  // Fallback direct newsletter JID
  return "120363383020614051@newsletter";
}

module.exports = {
  name: "ctt",
  aliases: ["channeltiktok", "ttchannel"],
  description: "Download and forward TikTok video directly to WhatsApp Channel",

  execute: async (sock, msg, from, args) => {
    const rawText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
    const extractUrl = args[0] || rawText.match(/https?:\/\/[^\s]+/)?.[0];

    if (!extractUrl || (!extractUrl.includes("tiktok.com") && !extractUrl.includes("vt.tiktok.com"))) {
      sock.sendMessage(from, { react: { text: "⚠️", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        {
          text:
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 👸🏻*
> ━━━━━━━━━━━━━━━━
> 📝 *Usage:* \`.ctt <tiktok_url>\`
> 📢 *Target:* WhatsApp Channel
> ━━━━━━━━━━━━━━━━`
        },
        { quoted: msg }
      );
    }

    sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});
    await sock.sendMessage(
      from,
      { text: "⏳ *Processing your request... Forwarding video to Channel.*" },
      { quoted: msg }
    );

    try {
      const data = await fetchTikTokData(extractUrl.trim());
      if (!data || !data.videoUrl) {
        throw new Error("Could not retrieve TikTok download stream.");
      }

      const videoBuffer = await fetchStreamBuffer(data.videoUrl);
      if (!videoBuffer) {
        throw new Error("Failed to download video buffer.");
      }

      const targetJid = await getChannelJid(sock);

      // Baileys Newsletter Video Delivery
      await sock.sendMessage(targetJid, {
        video: videoBuffer,
        caption: data.title,
        mimetype: "video/mp4",
        fileName: "tiktok.mp4"
      });

      sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
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
      console.error("[CTT EXECUTION ERROR]:", err);
      sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        { text: `❌ *Failed to forward to channel:* (${err.message})` },
        { quoted: msg }
      );
    }
  }
};
