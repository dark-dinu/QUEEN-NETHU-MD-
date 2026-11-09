module.exports = {
  name: "ping",
  description: "Check real bot response speed",
  execute: async (sock, msg, from) => {
    // WhatsApp server එකෙන් message එක ලැබුණු timestamp එක හරහා real latency එක ගණනය කිරීම
    const messageTimestamp = (msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000;
    const latency = Math.max(0, Date.now() - messageTimestamp);

    await sock.sendMessage(
      from,
      { text: `\`\`\`𝗽𝗼𝗻𝗴 ${latency}𝗺𝘀 📍\`\`\`` },
      { quoted: msg }
    );
  }
};
