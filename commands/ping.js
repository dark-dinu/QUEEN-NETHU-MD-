module.exports = {
  name: "ping",
  aliases: ["speed", "p"],
  description: "Check bot realtime response speed",

  execute: async (sock, msg, from) => {
    // 1. Message එක WhatsApp Server එකෙන් ආ වෙලාව සහ දැන් වෙලාව අතර වෙනස (Real Latency)
    const startTimestamp = (msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now());
    const realSpeed = Math.max(1, Date.now() - startTimestamp);

    // 2. Reaction එකක් එක් කිරීම
    await sock.sendMessage(from, { react: { text: "💗", key: msg.key } }).catch(() => {});

    // 3. Edit නොවී එකවරම Real Latency එක සහිතව Message එක යැවීම
    const pingText = 
`> *👸🏻⃝🌸 QUEEN NETHU — PING*

> *🕊️ ᴘᴏɴɢ! ᴍʏ ᴋɪɴɢ ♡*
> ╭━━━〔 ✧ᴘɪɴɢ ɪɴꜰᴏ✧ 〕━━━╮
> ┃ ✦ Speed : *${realSpeed} ms*
> ┃ ✦ Status : *Online 🟢*
> ┃ ✦ Bot : 𝚀𝚄𝚎𝚎𝙽 𝙽𝚎𝚃𝙷𝚄
> ╰━━━━━━━━━━━━━━━━━━╯
*♡ ᴍᴀᴅᴇ ᴡɪᴛʜ ʜᴇꜱʜᴀɴ ♡*`;

    return await sock.sendMessage(
      from,
      { text: pingText },
      { quoted: msg }
    );
  }
};
