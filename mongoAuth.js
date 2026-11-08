const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

/**
 * MongoDB එකේ WhatsApp session (creds + keys) save කරන auth state.
 * restart උනත් නැවත link කරන්න ඕනි නෑ.
 */
async function useMongoAuthState(collection, sessionId = 'default') {
  const id = (name) => `${sessionId}:${name}`;

  const write = (name, data) =>
    collection.replaceOne(
      { _id: id(name) },
      { _id: id(name), session: sessionId, value: JSON.stringify(data, BufferJSON.replacer) },
      { upsert: true }
    );

  const read = async (name) => {
    const doc = await collection.findOne({ _id: id(name) });
    return doc ? JSON.parse(doc.value, BufferJSON.reviver) : null;
  };

  const creds = (await read('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (keyId) => {
              let value = await read(`${type}-${keyId}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[keyId] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const ops = [];
          for (const category in data) {
            for (const keyId in data[category]) {
              const value = data[category][keyId];
              const _id = id(`${category}-${keyId}`);
              if (value) {
                ops.push({
                  replaceOne: {
                    filter: { _id },
                    replacement: { _id, session: sessionId, value: JSON.stringify(value, BufferJSON.replacer) },
                    upsert: true,
                  },
                });
              } else {
                ops.push({ deleteOne: { filter: { _id } } });
              }
            }
          }
          if (ops.length) await collection.bulkWrite(ops, { ordered: false });
        },
      },
    },
    saveCreds: () => write('creds', creds),
    clear: () => collection.deleteMany({ session: sessionId }),
  };
}

module.exports = { useMongoAuthState };
