
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { useMongoAuthState } = require('./mongoAuth');
const cfg = require('./config');

const logger = pino({ level: 'silent' });
const sessions = new Map(); // number -> { id, sock, status, retries, stopped, settings, clear, pairTimer }
let cols = null;
let versionCache = null;

function init(collections) {
  cols = collections;
}

async function getVersion() {
  if (!versionCache) {
    versionCache = (await fetchLatestBaileysVersion()).version;
    setTimeout(() => (versionCache = null), 6 * 3600 * 1000).unref();
  }
  return versionCache;
}

// ---------------- Session lifecycle ----------------
async function startSession(id) {
  let s = sessions.get(id);
  if (s && s.sock && !s.stopped) return s;

  s = s || { id, retries: 0, status: 'starting' };
  s.stopped = false;
  sessions.set(id, s);

  // settings (DB එකේ තියෙන ඒවා; නැත්නම් විතරක් default දානවා)
  const doc = await cols.settings.findOneAndUpdate(
    { _id: id },
    { $setOnInsert: { ...cfg.DEFAULT_SETTINGS } },
    { upsert: true, returnDocument: 'after' }
  );
  s.settings = { ...cfg.DEFAULT_SETTINGS, ...(doc || {}) };

  const { state, saveCreds, clear } = await useMongoAuthState(cols.auth, id);
  s.clear = clear;
  const version = await getVersion();

  const sock = makeWASocket({
    version,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });
  s.sock = sock;
  s.registered = !!state.creds.registered;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (s.sock !== sock) return; // පරණ socket එකක event

    if (connection === 'open') {
      s.status = 'open';
      s.retries = 0;
      s.registered = true;
      clearTimeout(s.pairTimer);
      await cols.bots.updateOne(
        { _id: id },
        { $set: { owner: cfg.INSTANCE_ID, registered: true, lastSeen: new Date() } },
        { upsert: true }
      );
      console.log(`✅ [${id}] connected (active: ${activeCount()})`);
    }

    if (connection === 'close') {
      s.status = 'reconnecting';
      const code = lastDisconnect?.error?.output?.statusCode;
      if (s.stopped) return;

      if (code === DisconnectReason.loggedOut || code === DisconnectReason.forbidden) {
        console.log(`🚪 [${id}] logged out / forbidden → removing`);
        return removeSession(id);
      }
      if (code === DisconnectReason.connectionReplaced) {
        console.log(`⚠️ [${id}] replaced by another login → stopped`);
        return stopSession(id);
      }
      s.retries++;
      if (!s.registered && s.retries > 4) return removeSession(id); // pair එක අසාර්ථක
      const wait = Math.min(30000, 2000 * s.retries);
      setTimeout(() => {
        if (!s.stopped) startSession(id).catch((e) => console.error(`[${id}] restart error`, e.message));
      }, wait);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    handleMessage(s, messages[0]).catch((e) => console.error(`[${id}] msg error`, e.message));
  });

  return s;
}

function stopSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  s.stopped = true;
  clearTimeout(s.pairTimer);
  try {
    s.sock?.end(undefined);
  } catch {}
  sessions.delete(id);
}

async function removeSession(id) {
  const s = sessions.get(id);
  stopSession(id);
  try {
    if (s?.clear) await s.clear();
    else await cols.auth.deleteMany({ session: id });
    await cols.bots.deleteOne({ _id: id });
    await cols.settings.deleteOne({ _id: id });
  } catch (e) {
    console.error(`[${id}] remove error`, e.message);
  }
}

// ---------------- Pairing (website එකෙන්) ----------------
async function pair(number) {
  if (sessions.size >= cfg.MAX_BOTS && !sessions.has(number)) {
    throw new Error('Server full. පසුව උත්සාහ කරන්න.');
  }
  const meta = await cols.bots.findOne({ _id: number });
  if (meta?.registered && meta.owner !== cfg.INSTANCE_ID) throw new Error('මේ number එක දැනටමත් link කරලා.');
  const live = sessions.get(number);
  if (live?.status === 'open') throw new Error('මේ number එක දැනටමත් connected.');

  if (live || meta) await removeSession(number); // අලුතින් පටන් ගන්න

  await cols.bots.updateOne(
    { _id: number },
    { $set: { owner: cfg.INSTANCE_ID, registered: false, createdAt: new Date() } },
    { upsert: true }
  );

  const s = await startSession(number);
  await delay(2500);
  const code = await s.sock.requestPairingCode(number);

  // විනාඩි 3ක් ඇතුලත link නොකළොත් clean up
  s.pairTimer = setTimeout(() => {
    if (s.status !== 'open') removeSession(number);
  }, 3 * 60 * 1000);

  return code;
}

// ---------------- Boot: DB එකේ ඉන්න හැම bot කෙනෙක්ම auto connect ----------------
async function loadAll() {
  // අවසන් නොකළ පරණ pair attempts අයින් කරනවා
  const stale = await cols.bots
    .find({ owner: cfg.INSTANCE_ID, registered: false, createdAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } })
    .toArray();
  for (const b of stale) await removeSession(b._id);

  const list = await cols.bots
    .find({ owner: cfg.INSTANCE_ID, registered: true })
    .project({ _id: 1 })
    .limit(cfg.MAX_BOTS)
    .toArray();
  console.log(`🤖 Auto-connecting ${list.length} bots...`);

  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const id = list[i++]._id;
      try {
        await startSession(id);
      } catch (e) {
        console.error(`[${id}] start error`, e.message);
      }
      await delay(cfg.START_DELAY_MS);
    }
  };
  await Promise.all(Array.from({ length: cfg.START_CONCURRENCY }, worker));
  console.log('✅ All bots queued');
}

async function shutdown() {
  for (const id of [...sessions.keys()]) stopSession(id); // logout නොකර connection විතරක් නවත්තනවා
}

// ---------------- Commands ----------------
async function handleMessage(s, msg) {
  if (!msg?.message || msg.key.remoteJid === 'status@broadcast') return;
  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    '';
  const prefix = s.settings.prefix;
  if (!text.startsWith(prefix)) return;

  const [cmd] = text.slice(prefix.length).trim().split(/\s+/);
  const jid = msg.key.remoteJid;

  switch (cmd.toLowerCase()) {
    case 'ping': {
      const start = Date.now();
      const sent = await s.sock.sendMessage(jid, { text: '🏓 Pinging...' }, { quoted: msg });
      const ms = Date.now() - start;
      await s.sock.sendMessage(jid, { text: `🏓 Pong! *${ms}ms*`, edit: sent.key });
      break;
    }
  }
}

const activeCount = () => [...sessions.values()].filter((s) => s.status === 'open').length;
const getStatus = (id) => sessions.get(id)?.status || 'none';

module.exports = { init, pair, loadAll, shutdown, getStatus, activeCount, total: () => sessions.size };
