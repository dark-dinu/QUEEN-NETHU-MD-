const mongoose = require("mongoose");
const { proto, initAuthCreds, BufferJSON } = require("@whiskeysockets/baileys");

const AuthSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    data: { type: String, required: true }
  },
  { timestamps: false }
);

const AuthModel = mongoose.models.SessionAuth || mongoose.model("SessionAuth", AuthSchema);
const memoryCache = new Map();

function isLinked(creds) {
  return !!(creds && (creds.registered || creds.account || creds.me));
}

async function clearAuth(sessionId = "bot1") {
  const pfx = sessionId === "bot1" ? "" : `${sessionId}_`;
  for (const key of memoryCache.keys()) {
    if (key.startsWith(pfx)) memoryCache.delete(key);
  }
  try {
    if (sessionId === "bot1") {
      await AuthModel.deleteMany({ id: { $not: /^bot[2-3]_/ } });
    } else {
      await AuthModel.deleteMany({ id: new RegExp(`^${sessionId}_`) });
    }
  } catch (err) {
    console.error("Auth clear failed:", err.message);
  }
}

async function useMongoAuthState(sessionId = "bot1") {
  // පැරණි bot1 හි Session keys පෙර තිබූ පරිදිම (prefix නොමැතිව) තබා ගනී
  const pfx = sessionId === "bot1" ? "" : `${sessionId}_`;

  const writeData = async (id, data) => {
    const fullId = `${pfx}${id}`;
    memoryCache.set(fullId, data);
    try {
      const serialized = JSON.stringify(data, BufferJSON.replacer);
      await AuthModel.updateOne({ id: fullId }, { data: serialized }, { upsert: true });
    } catch (err) {
      console.error(`Write failed (${fullId}):`, err.message);
    }
  };

  const readData = async (id) => {
    const fullId = `${pfx}${id}`;
    if (memoryCache.has(fullId)) return memoryCache.get(fullId);
    try {
      const doc = await AuthModel.findOne({ id: fullId }).lean().exec();
      if (!doc) return null;
      const parsed = JSON.parse(doc.data, BufferJSON.reviver);
      memoryCache.set(fullId, parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    const fullId = `${pfx}${id}`;
    memoryCache.delete(fullId);
    try {
      await AuthModel.deleteOne({ id: fullId });
    } catch {}
  };

  let creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (value) {
                if (type === "app-state-sync-key") {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
              }
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData("creds", creds)
  };
}

module.exports = { useMongoAuthState, isLinked, clearAuth };
