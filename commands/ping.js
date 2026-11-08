module.exports = {
  name: "ping",
  description: "Check ultra-fast latency",
  execute: async (sock, msg, from) => {
    const start = process.hrtime();
    const sent = await sock.sendMessage(from, { text: "⚡ *Testing Speed...*" }, { quoted: msg });
    const diff = process.hrtime(start);
    const latency = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

    await sock.sendMessage(
      from,
      {
        text: `⚡ *QUEEN NETHU MD ULTRA SPEED*\n\n🚀 *Latency:* \`${latency} ms\`\n💾 *Engine:* Baileys Multi-Device (Cached)\n🌐 *Platform:* Linux / Node.js`,
        edit: sent.key
      }
    );
  }
};
