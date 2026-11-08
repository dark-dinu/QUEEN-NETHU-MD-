const mongoose = require("mongoose");
const { proto } = require("@whiskeysockets/baileys");

const AuthSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    data: { type: String, required: true }
  },
  { timestamps: false }
);

const AuthModel = mongoose.model("SessionAuth", AuthSchema);
const memCache = new Map();

async function useMongoAuthState() {
  const writeData = async (id, data) => {
    memCache.set(id, data);
    const serialized = JSON.stringify(data, (key, value) => {
      if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
        return { type: "Buffer", data: Array.from(value) };
      }
      return value;
    });
    // Non-blocking background sync
    AuthModel.updateOne({ id }, { data: serialized }, { upsert: true }).catch(() => {});
  };

  const readData = async (id) => {
    if (memCache.has(id)) return memCache.get(id);
    try {
      const doc = await AuthModel.findOne({ id }).lean().exec();
      if (!doc) return null;
      const parsed = JSON.parse(doc.data, (key, value) => {
        if (value && value.type === "Buffer" && Array.isArray(value.data)) {
          return Buffer.from(value.data);
        }
        return value;
      });
      memCache.set(id, parsed);
      return parsed;
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    memCache.delete(id);
    AuthModel.deleteOne({ id }).catch(() => {});
  };

  const creds = (await readData("creds")) || (await import("@whiskeysockets/baileys")).initAuthCreds();

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

module.exports = { useMongoAuthState };
