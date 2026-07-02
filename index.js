import 'dotenv/config';
import cron from 'node-cron';
import express from 'express';
import { loadJSON } from './utils.js';
import { startListener } from './listener.js';
import { runAggregation, bootstrapState } from './aggregator.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Minimal Express app to keep the service awake via UptimeRobot
const app = express();
app.get('/ping', (req, res) => res.status(200).send('pong'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.info(`[Server] Ping endpoint active on port ${PORT}`));

async function start() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const isRunNow = args.includes('--run-now');

  if (isTest) {
    console.info('[Mode] Running in pure TEST/VERIFICATION mode...');
    await runAggregation('Test Run', true);
    return;
  }

  await bootstrapState();

  if (isRunNow) {
    console.info('[Mode] Running immediate aggregation cycle...');
    await runAggregation('Immediate Run', false, true);
    return;
  }

  const config = await loadJSON(CONFIG_PATH);
  const telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || config.telegram.botToken,
    targetChatId: process.env.TELEGRAM_CHAT_ID || config.telegram.targetChatId
  };

  startListener(telegramConfig, runAggregation).catch(console.error);

  const schedules = config.schedule || [];
  for (const timeStr of schedules) {
    const [hour, minute] = timeStr.split(':').map(Number);
    const cronPattern = `${minute} ${hour} * * *`;
    cron.schedule(cronPattern, () => runAggregation(timeStr, false, false));
    console.info(`[Scheduler] Scheduled job for ${timeStr}`);
  }
}

start().catch(err => {
  console.error('[Fatal Error] Startup crashed:', err);
  process.exit(1);
});
