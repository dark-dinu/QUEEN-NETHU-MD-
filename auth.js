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
const memCache = new Map();

// WhatsApp multi-device වල link වුණාම `creds.account` set වෙනවා.
// (creds.registered කියන එක MD වල හැමවිටම true වෙන්නෙ නෑ, ඒකයි කලින් bot start වෙන්නෙ නැතුව තිබුණෙ)
function isLinked(creds) {
  return !!(creds && (creds.registered || creds.account));
}

async function clearAuth() {
  memCache.clear();
  await AuthModel.deleteMany({});
}

async function useMongoAuthState() {
  const writeData = async (id, data) => {
    memCache.set(id, data);
    try {
      const serialized = JSON.stringify(data, BufferJSON.replacer);
      await AuthModel.updateOne({ id }, { data: serialized }, { upsert: true });
    } catch (err) {
      console.error(`Auth write failed (${id}):`, err.message);
    }
  };

  const readData = async (id) => {
    if (memCache.has(id)) return memCache.get(id);
    try {
      const doc = await AuthModel.findOne({ id }).lean().exec();
      if (!doc) return null;
      const parsed = JSON.parse(doc.data, BufferJSON.reviver);
      memCache.set(id, parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    memCache.delete(id);
    try {
      await AuthModel.deleteOne({ id });
    } catch {}
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
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
