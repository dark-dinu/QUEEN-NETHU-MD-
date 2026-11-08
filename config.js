// සියල්ල මෙතන තියෙනවා. ENV variables තිබුනොත් ඒවා මෙයට වඩා ප්‍රමුඛයි.
module.exports = {
  MONGO_URI:
    process.env.MONGO_URI ||
    'mongodb+srv://diniduheshan40_db_user:nziBElbMabqIwsol@cluster0.5gazebm.mongodb.net/?appName=Cluster0',
  DB_NAME: process.env.DB_NAME || 'wabot',

  PORT: Number(process.env.PORT) || 3000,

  // Multi-instance (bots 5k වගේ ගොඩක් නම්): හැම server එකකටම වෙනස් INSTANCE_ID එකක් දෙන්න
  INSTANCE_ID: process.env.INSTANCE_ID || 'main',

  // එක process එකක run කරන max bots ගාන (RAM එක අනුව වෙනස් කරන්න)
  MAX_BOTS: Number(process.env.MAX_BOTS) || 300,

  // Startup එකේදී එකවර connect කරන ගාන සහ ඒවා අතර delay (ms) — ban/rate-limit වළක්වන්න
  START_CONCURRENCY: Number(process.env.START_CONCURRENCY) || 5,
  START_DELAY_MS: Number(process.env.START_DELAY_MS) || 800,

  DEFAULT_SETTINGS: {
    prefix: '.',
    botName: 'My WA Bot',
  },
};
