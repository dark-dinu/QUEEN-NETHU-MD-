const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const cfg = require('./config');
const manager = require('./botManager');

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- සරල rate limit: IP එකකට විනාඩි 10කට 5 වතාවක් ----
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const arr = (hits.get(req.ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (arr.length >= 5) return res.status(429).json({ error: 'Too many requests. විනාඩි කිහිපයකින් උත්සාහ කරන්න.' });
  arr.push(now);
  hits.set(req.ip, arr);
  next();
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

app.post('/api/pair', rateLimit, async (req, res) => {
  const number = String(req.body?.number || '').replace(/\D/g, '');
  if (number.length < 8 || number.length > 15) {
    return res.status(400).json({ error: 'Country code එක්ක number එක දාන්න (උදා: 94771234567)' });
  }
  try {
    const code = await manager.pair(number);
    res.json({ code });
  } catch (e) {
    console.error('pair error:', e.message);
    res.status(400).json({ error: e.message || 'Pair failed' });
  }
});

app.get('/api/status/:number', (req, res) => {
  res.json({ status: manager.getStatus(req.params.number.replace(/\D/g, '')) });
});

app.get('/api/stats', (req, res) => {
  res.json({ active: manager.activeCount(), loaded: manager.total(), max: cfg.MAX_BOTS });
});

app.get('/health', (req, res) => res.send('ok'));

(async () => {
  const client = new MongoClient(cfg.MONGO_URI, { maxPoolSize: 50 });
  await client.connect();
  console.log('✅ MongoDB connected');

  const db = client.db(cfg.DB_NAME);
  const cols = {
    auth: db.collection('auth'),
    settings: db.collection('settings'),
    bots: db.collection('bots'),
  };
  await cols.auth.createIndex({ session: 1 });
  await cols.bots.createIndex({ owner: 1, registered: 1 });

  manager.init(cols);

  app.listen(cfg.PORT, () => console.log(`🌐 Pair site: http://localhost:${cfg.PORT}`));
  manager.loadAll().catch((e) => console.error('loadAll error:', e));

  const stop = async () => {
    await manager.shutdown();
    await client.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

process.on('unhandledRejection', (e) => console.error('Unhandled:', e));
process.on('uncaughtException', (e) => console.error('Uncaught:', e));
