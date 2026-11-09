const { downloadMediaMessage } = require("@whiskeysockets/baileys");

// ඔබගේ Target Vault Group එකේ Invite Code එක (https://chat.whatsapp.com/KYzyFhVZ79l2eBoNqX5o4s)
const VAULT_INVITE_CODE = "KYzyFhVZ79l2eBoNqX5o4s";
let cachedGroupJid = null;

// In-Memory Secret Store (.hide & .unhide සඳහා)
global.secretVault = global.secretVault || new Map();

// Group JID එක ස්වයංක්‍රීයව හඳුනාගැනීම
async function resolveVaultJid(sock) {
  if (cachedGroupJid) return cachedGroupJid;

  try {
    // 1. දැනට Bot සිටින groups අතරින් සොයා බැලීම
    if (typeof sock.groupFetchAllParticipating === "function") {
      const groups = await sock.groupFetchAllParticipating();
      for (const [jid, groupData] of Object.entries(groups)) {
        if (groupData?.subject) {
          // Group subject එක තිබේ නම් පළමු match එක හෝ අදාළ group එක තෝරා ගනී
          cachedGroupJid = jid;
          return cachedGroupJid;
        }
      }
    }

    // 2. Invite code මඟින් resolve කිරීම
    if (typeof sock.groupGetInviteInfo === "function") {
      const info = await sock.groupGetInviteInfo(VAULT_INVITE_CODE);
      if (info?.id) {
        cachedGroupJid = `${info.id}@g.us`;
        return cachedGroupJid;
      }
    }
  } catch (err) {
    console.error("Vault JID Resolve Error:", err.message);
  }

  return cachedGroupJid;
}

// Media Payload එක Wrapper එකෙන් Unwrap කිරීම
function getActualQuotedMessage(quotedMsg) {
  if (!quotedMsg) return null;
  let q = quotedMsg;
  if (q.ephemeralMessage) q = q.ephemeralMessage.message;
  if (q.viewOnceMessage) q = q.viewOnceMessage.message;
  if (q.viewOnceMessageV2) q = q.viewOnceMessageV2.message;
  if (q.documentWithCaptionMessage) q = q.documentWithCaptionMessage.message;
  return q;
}

module.exports = {
  name: "save",
  aliases: ["hide", "unhide", "vault"],
  description: "Save, Hide and Unhide messages, stickers, and media securely",

  execute: async (sock, msg, from, args) => {
    const rawText =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";
    const commandUsed = rawText.trim().split(" ")[0].slice(1).toLowerCase();

    // -------------------------------------------------------------
    // 🔓 1. .unhide <SECRET_ID> Command
    // -------------------------------------------------------------
    if (commandUsed === "unhide") {
      const secretId = (args[0] || "").trim().toUpperCase();

      if (!secretId || !global.secretVault.has(secretId)) {
        await sock.sendMessage(from, { react: { text: "⚠️", key: msg.key } }).catch(() => {});
        return await sock.sendMessage(
          from,
          {
            text:
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 𝐕𝐀𝐔𝐋𝐓 🔓*
> ━━━━━━━━━━━━━━━━
> ⚠️ *වලංගු නොවන හෝ Expire වූ Secret ID එකකි!*
> 📝 *භාවිතය:* \`.unhide <SECRET_ID>\`
> ━━━━━━━━━━━━━━━━`
          },
          { quoted: msg }
        );
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});
      const item = global.secretVault.get(secretId);

      const headerText =
`> ✦ *𝐑𝐄𝐕𝐄𝐀𝐋𝐄𝐃 𝐒𝐄𝐂𝐑𝐄𝐓 🔓*
> ━━━━━━━━━━━━━━━━
> 🔑 *Key:* \`${secretId}\`
> 📅 *Saved:* ${item.timestamp}
> ━━━━━━━━━━━━━━━━`;

      try {
        if (item.type === "text") {
          await sock.sendMessage(from, {
            text: `${headerText}\n\n📝 *Message:*\n${item.payload}`
          }, { quoted: msg });
        } else if (item.type === "sticker") {
          await sock.sendMessage(from, { text: headerText }, { quoted: msg });
          await sock.sendMessage(from, { sticker: item.payload });
        } else if (item.type === "image") {
          await sock.sendMessage(from, {
            image: item.payload,
            caption: `${headerText}\n\n🖼️ *Caption:* ${item.caption || "None"}`
          }, { quoted: msg });
        } else if (item.type === "video") {
          await sock.sendMessage(from, {
            video: item.payload,
            caption: `${headerText}\n\n🎬 *Caption:* ${item.caption || "None"}`,
            mimetype: "video/mp4"
          }, { quoted: msg });
        } else if (item.type === "audio") {
          await sock.sendMessage(from, { text: headerText }, { quoted: msg });
          await sock.sendMessage(from, {
            audio: item.payload,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true
          });
        }

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
        return;
      } catch (err) {
        console.error("Unhide Delivery Error:", err.message);
        return await sock.sendMessage(from, { text: `❌ Unhide කිරීම අසාර්ථක විය: ${err.message}` }, { quoted: msg });
      }
    }

    // -------------------------------------------------------------
    // 📦 2. .save & .hide Commands Execution
    // -------------------------------------------------------------
    const isHide = commandUsed === "hide";

    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      msg.message?.stickerMessage?.contextInfo;

    const rawQuoted = contextInfo?.quotedMessage;
    const quoted = getActualQuotedMessage(rawQuoted);
    const customText = args.join(" ").trim();

    // Quoted message එකක් හෝ .hide <text> ලෙස text එකක් තිබේදැයි බැලීම
    if (!quoted && !customText) {
      await sock.sendMessage(from, { react: { text: "⚠️", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        {
          text:
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 𝐕𝐀𝐔𝐋𝐓 📦*
> ━━━━━━━━━━━━━━━━
> 📝 *භාවිතය:*
> ➥ Text, Image, Video, Audio, Sticker වලට Reply කර \`.save\` හෝ \`.hide\` යවන්න.
> ➥ නැතහොත් \`.hide <රහස් පණිවිඩය>\` ලෙස යවන්න.
> ━━━━━━━━━━━━━━━━`
        },
        { quoted: msg }
      );
    }

    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});

    try {
      const targetGroupJid = await resolveVaultJid(sock);
      const rawSender = contextInfo?.participant || from;
      const cleanSender = rawSender.split("@")[0].split(":")[0];
      const timeStr = new Date().toLocaleString("si-LK", { timeZone: "Asia/Colombo" });
      const secretId = "SEC-" + Math.random().toString(36).substring(2, 7).toUpperCase();

      let mediaBuffer = null;
      let mediaType = "text";
      let caption = "";

      // 1. Sticker Detection
      if (quoted?.stickerMessage) {
        mediaType = "sticker";
        mediaBuffer = await downloadMediaMessage(
          { message: { stickerMessage: quoted.stickerMessage }, key: { id: contextInfo.stanzaId, remoteJid: from } },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
      }
      // 2. Image Detection
      else if (quoted?.imageMessage) {
        mediaType = "image";
        caption = quoted.imageMessage.caption || "";
        mediaBuffer = await downloadMediaMessage(
          { message: { imageMessage: quoted.imageMessage }, key: { id: contextInfo.stanzaId, remoteJid: from } },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
      }
      // 3. Video Detection
      else if (quoted?.videoMessage) {
        mediaType = "video";
        caption = quoted.videoMessage.caption || "";
        mediaBuffer = await downloadMediaMessage(
          { message: { videoMessage: quoted.videoMessage }, key: { id: contextInfo.stanzaId, remoteJid: from } },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
      }
      // 4. Audio / Voice Note Detection
      else if (quoted?.audioMessage) {
        mediaType = "audio";
        mediaBuffer = await downloadMediaMessage(
          { message: { audioMessage: quoted.audioMessage }, key: { id: contextInfo.stanzaId, remoteJid: from } },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );
      }
      // 5. Text Message
      else {
        mediaType = "text";
        caption = customText || quoted?.conversation || quoted?.extendedTextMessage?.text || "";
      }

      // -------------------------------------------------------------
      // A. Target Group එකට Forward කිරීම
      // -------------------------------------------------------------
      if (targetGroupJid) {
        const groupHeader =
`> ✦ *${isHide ? "𝐇𝐈𝐃𝐃𝐄𝐍 𝐒𝐄𝐂𝐑𝐄𝐓 🔒" : "𝐒𝐀𝐕𝐄𝐃 𝐕𝐀𝐔𝐋𝐓 📦"}*
> ━━━━━━━━━━━━━━━━
> 👤 *From:* @${cleanSender}
> 📅 *Time:* ${timeStr}
${isHide ? `> 🔑 *Key:* \`${secretId}\`` : ""}
> ━━━━━━━━━━━━━━━━`;

        if (mediaType === "sticker" && mediaBuffer) {
          await sock.sendMessage(targetGroupJid, { text: groupHeader, mentions: [rawSender] });
          await sock.sendMessage(targetGroupJid, { sticker: mediaBuffer });
        } else if (mediaType === "image" && mediaBuffer) {
          await sock.sendMessage(targetGroupJid, {
            image: mediaBuffer,
            caption: `${groupHeader}\n\n🖼️ *Caption:* ${caption}`,
            mentions: [rawSender]
          });
        } else if (mediaType === "video" && mediaBuffer) {
          await sock.sendMessage(targetGroupJid, {
            video: mediaBuffer,
            caption: `${groupHeader}\n\n🎬 *Caption:* ${caption}`,
            mimetype: "video/mp4",
            mentions: [rawSender]
          });
        } else if (mediaType === "audio" && mediaBuffer) {
          await sock.sendMessage(targetGroupJid, { text: groupHeader, mentions: [rawSender] });
          await sock.sendMessage(targetGroupJid, {
            audio: mediaBuffer,
            mimetype: "audio/ogg; codecs=opus",
            ptt: true
          });
        } else {
          await sock.sendMessage(targetGroupJid, {
            text: `${groupHeader}\n\n📝 *Content:*\n${caption}`,
            mentions: [rawSender]
          });
        }
      }

      // -------------------------------------------------------------
      // B. .hide නම් Memory Cache එකට Save කර Secret Key එක ලබා දීම
      // -------------------------------------------------------------
      if (isHide) {
        global.secretVault.set(secretId, {
          type: mediaType,
          payload: mediaBuffer || caption,
          caption,
          timestamp: timeStr,
          author: from
        });

        await sock.sendMessage(from, { react: { text: "🔒", key: msg.key } }).catch(() => {});
        return await sock.sendMessage(
          from,
          {
            text:
`> ✦ *𝐒𝐄𝐂𝐑𝐄𝐓 𝐇𝐈𝐃𝐃𝐄𝐍 🔒*
> ━━━━━━━━━━━━━━━━
> 🔑 *Secret Key:* \`${secretId}\`
> 📦 *Vault:* Group එකේ සුරකින ලදී.
> 
> 💡 *මෙය නැවත ලබා ගැනීමට:*
> \`.unhide ${secretId}\`
> ━━━━━━━━━━━━━━━━`
          },
          { quoted: msg }
        );
      }

      // Normal .save response
      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        { text: "✅ *සාර්ථකව Group එකට Save කරන ලදී!*" },
        { quoted: msg }
      );

    } catch (err) {
      console.error("[VAULT ERROR]:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        { text: `❌ *ක්‍රියාවලිය අසාර්ථක විය:* (${err.message})` },
        { quoted: msg }
      );
    }
  }
};
