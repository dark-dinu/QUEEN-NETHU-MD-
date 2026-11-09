const { downloadMediaMessage } = require("@whiskeysockets/baileys");

// Invite code එකෙන් group එක සොයා ගැනීම
const VAULT_INVITE_CODE = "KYzyFhVZ79l2eBoNqX5o4s";
let cachedGroupJid = null;

async function getVaultGroupJid(sock) {
  if (cachedGroupJid) return cachedGroupJid;
  try {
    if (typeof sock.groupGetInviteInfo === "function") {
      const info = await sock.groupGetInviteInfo(VAULT_INVITE_CODE);
      if (info?.id) {
        cachedGroupJid = `${info.id}@g.us`;
        return cachedGroupJid;
      }
    }
  } catch (err) {
    console.error("Invite lookup error:", err.message);
  }
  return null;
}

module.exports = {
  name: "save",
  aliases: ["vault", "keep"],
  description: "Save messages, stickers, and media directly to Vault Group",

  execute: async (sock, msg, from, args) => {
    const contextInfo =
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo ||
      msg.message?.stickerMessage?.contextInfo;

    const quotedMessage = contextInfo?.quotedMessage;

    if (!quotedMessage) {
      await sock.sendMessage(from, { react: { text: "⚠️", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        {
          text:
`> ✦ *𝐐𝐔𝐄𝐄𝐍 𝐍𝐄𝐓𝐇𝐔 𝐕𝐀𝐔𝐋𝐓 📦*
> ━━━━━━━━━━━━━━━━
> ⚠️ *භාවිතය:* ඔබට Save කිරීමට අවශ්‍ය Text, Sticker හෝ Media පණිවිඩයට Reply කර \`.save\` ලෙස යවන්න.
> ━━━━━━━━━━━━━━━━`
        },
        { quoted: msg }
      );
    }

    await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } }).catch(() => {});

    try {
      const targetGroupJid = await getVaultGroupJid(sock);
      if (!targetGroupJid) {
        throw new Error("Group එක හඳුනා ගැනීමට නොහැකි විය. Bot එම Group එකේ සිටීදැයි පරීක්ෂා කරන්න.");
      }

      const rawSender = contextInfo.participant || from;
      const cleanSender = rawSender.split("@")[0].split(":")[0];

      const headerText =
`> ✦ *𝐒𝐀𝐕𝐄𝐃 𝐌𝐄𝐒𝐒𝐀𝐆𝐄 📦*
> ━━━━━━━━━━━━━━━━
> 👤 *Saved From:* @${cleanSender}
> 📅 *Timestamp:* ${new Date().toLocaleString("si-LK", { timeZone: "Asia/Colombo" })}
> ━━━━━━━━━━━━━━━━\n`;

      // 1. Sticker Message
      if (quotedMessage.stickerMessage) {
        const stickerBuffer = await downloadMediaMessage(
          { message: quotedMessage, key: { id: contextInfo.stanzaId, remoteJid: from } },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );

        await sock.sendMessage(targetGroupJid, {
          text: headerText,
          mentions: [rawSender]
        });

        await sock.sendMessage(targetGroupJid, {
          sticker: stickerBuffer
        });
      }
      // 2. Text Message
      else if (quotedMessage.conversation || quotedMessage.extendedTextMessage?.text) {
        const textContent =
          quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;

        await sock.sendMessage(targetGroupJid, {
          text: `${headerText}\n📝 *Content:*\n${textContent}`,
          mentions: [rawSender]
        });
      }
      // 3. Media Message (Image, Video, Audio, Document)
      else if (
        quotedMessage.imageMessage ||
        quotedMessage.videoMessage ||
        quotedMessage.audioMessage ||
        quotedMessage.documentMessage
      ) {
        const mediaBuffer = await downloadMediaMessage(
          { message: quotedMessage, key: { id: contextInfo.stanzaId, remoteJid: from } },
          "buffer",
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );

        if (quotedMessage.imageMessage) {
          await sock.sendMessage(targetGroupJid, {
            image: mediaBuffer,
            caption: `${headerText}\n🖼️ *Caption:* ${quotedMessage.imageMessage.caption || "No caption"}`,
            mentions: [rawSender]
          });
        } else if (quotedMessage.videoMessage) {
          await sock.sendMessage(targetGroupJid, {
            video: mediaBuffer,
            caption: `${headerText}\n🎬 *Caption:* ${quotedMessage.videoMessage.caption || "No caption"}`,
            mimetype: "video/mp4",
            mentions: [rawSender]
          });
        } else if (quotedMessage.audioMessage) {
          await sock.sendMessage(targetGroupJid, {
            text: headerText,
            mentions: [rawSender]
          });
          await sock.sendMessage(targetGroupJid, {
            audio: mediaBuffer,
            mimetype: quotedMessage.audioMessage.mimetype || "audio/mp4",
            ptt: !!quotedMessage.audioMessage.ptt
          });
        } else if (quotedMessage.documentMessage) {
          await sock.sendMessage(targetGroupJid, {
            document: mediaBuffer,
            mimetype: quotedMessage.documentMessage.mimetype,
            fileName: quotedMessage.documentMessage.fileName || "file",
            caption: headerText,
            mentions: [rawSender]
          });
        }
      }

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        { text: "✅ *සාර්ථකව Group එකට Save කරන ලදී!*" },
        { quoted: msg }
      );
    } catch (err) {
      console.error("[SAVE ERROR]:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } }).catch(() => {});
      return await sock.sendMessage(
        from,
        { text: `❌ *Save කිරීම අසාර්ථක විය:* (${err.message})` },
        { quoted: msg }
      );
    }
  }
};
