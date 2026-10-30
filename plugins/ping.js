module.exports = {
  command: "ping",
  aliases: ["speed"],
  execute: async ({ sock, from }) => {
    const start = Date.now();
    await sock.sendMessage(from, { text: "⚡ Checking speed..." });
    const latency = Date.now() - start;
    await sock.sendMessage(from, { text: `🚀 Speed: *${latency}ms*` });
  }
};
