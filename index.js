import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import cron from 'node-cron';
import 'dotenv/config'; // Load .env file automatically

import { scrapeChannel } from './scraper.js';
import { groupPostsByTag, compileDebriefMessages } from './processor.js';
import { sendDebrief } from './sender.js';
import { startListener } from './listener.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, 'state.json');

/**
 * Loads a JSON file safely.
 * @param {string} filePath 
 * @param {any} defaultValue 
 */
async function loadJSON(filePath, defaultValue = {}) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return defaultValue;
    }
    console.error(`[Error] Failed to read JSON file at ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Saves a JSON file safely.
 * @param {string} filePath 
 * @param {any} data 
 */
async function saveJSON(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Error] Failed to write JSON file at ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Seeds baseline post IDs for any newly-added channels to avoid flooding on startup.
 */
async function bootstrapState() {
  const config = await loadJSON(CONFIG_PATH);
  const state = await loadJSON(STATE_PATH);
  let stateChanged = false;

  console.info('[Bootstrap] Checking state baseline...');

  for (const source of config.sources.filter(s => s.enabled)) {
    const cleanChannel = source.username.replace(/^@/, '').trim();
    if (state[cleanChannel] === undefined) {
      console.info(`[Bootstrap] First run detected for channel: @${cleanChannel}. Bootstrapping baseline post ID silently...`);
      try {
        const posts = await scrapeChannel(cleanChannel);
        if (posts.length > 0) {
          const maxId = Math.max(...posts.map(p => p.id));
          state[cleanChannel] = maxId;
          console.info(`  -> Baseline set to latest post ID: ${maxId} for @${cleanChannel}`);
        } else {
          state[cleanChannel] = 0;
          console.info(`  -> No public posts found for @${cleanChannel}, initialized baseline to 0`);
        }
        stateChanged = true;
      } catch (err) {
        console.error(`  -> Failed to bootstrap baseline for @${cleanChannel}: ${err.message}. Will retry on next crawl.`);
      }
    }
  }

  if (stateChanged) {
    await saveJSON(STATE_PATH, state);
    console.info('[Bootstrap] State baseline updated successfully.\n');
  } else {
    console.info('[Bootstrap] All channels have a valid baseline state.\n');
  }
}

/**
 * Core flow that scrapes, filters, categorizes, formats, and sends debriefs.
 * 
 * @param {string} runTypeLabel - Label describing the schedule or manual trigger.
 * @param {boolean} [isTestMode=false] - True if we want to run a mock dry-run.
 * @param {boolean} [notifyIfEmpty=false] - True if we should notify Telegram even if no new posts.
 */
async function runAggregation(runTypeLabel, isTestMode = false, notifyIfEmpty = false) {
  console.info(`\n--- Starting Aggregation [${runTypeLabel}] at ${new Date().toLocaleString()} ---`);
  
  const config = await loadJSON(CONFIG_PATH);
  const state = await loadJSON(STATE_PATH);

  const allNewPosts = [];
  const pendingStateUpdates = {};

  const telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || config.telegram.botToken,
    targetChatId: process.env.TELEGRAM_CHAT_ID || config.telegram.targetChatId
  };

  for (const source of config.sources.filter(s => s.enabled)) {
    const cleanChannel = source.username.replace(/^@/, '').trim();
    console.info(`[Aggregator] Scraping @${cleanChannel}...`);

    try {
      const posts = await scrapeChannel(cleanChannel);
      const lastProcessedId = state[cleanChannel] || 0;

      let filteredPosts = [];

      if (isTestMode) {
        filteredPosts = posts.slice(-5);
      } else {
        filteredPosts = posts.filter(p => p.id > lastProcessedId);
      }

      for (const p of filteredPosts) {
        allNewPosts.push({ ...p, channel: cleanChannel });
      }

      if (posts.length > 0) {
        pendingStateUpdates[cleanChannel] = Math.max(...posts.map(p => p.id));
      }
    } catch (err) {
      console.error(`[Aggregator Error] Failed to process @${cleanChannel}:`, err.message);
    }
  }

  if (allNewPosts.length === 0) {
    console.info('[Aggregator] No new updates found. Skipping debrief dispatch.\n');
    if (notifyIfEmpty) {
      await sendDebrief([`📅 <b>TeleDebrief (${runTypeLabel})</b>\n\n<i>No new updates found since last check.</i>`], telegramConfig, false);
    }
    return;
  }

  // Sort all aggregated posts chronologically by date
  allNewPosts.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Categorize
  const grouped = groupPostsByTag(allNewPosts, config.tags, config.defaultTag);

  // Compile
  const messages = compileDebriefMessages(grouped, runTypeLabel);

  // Dispatch
  const sendSuccess = await sendDebrief(messages, telegramConfig, isTestMode);

  if (sendSuccess && !isTestMode) {
    // Commit new post IDs to state.json only on successful dispatch
    const updatedState = { ...state, ...pendingStateUpdates };
    await saveJSON(STATE_PATH, updatedState);
    console.info('[Aggregator] State updated and saved successfully.');
  }

  console.info(`--- Aggregation [${runTypeLabel}] finished ---\n`);
}

/**
 * Scheduler entry point
 */
async function start() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const isRunNow = args.includes('--run-now');

  if (isTest) {
    console.info('[Mode] Running in pure TEST/VERIFICATION mode (does not save state, fetches latest 5 posts per source)...');
    await runAggregation('Test Run', true);
    return;
  }

  // Silent first-run initialization (bootstrapping)
  await bootstrapState();

  if (isRunNow) {
    console.info('[Mode] Running immediate aggregation cycle...');
    await runAggregation('Immediate Run', false, true); // notifyIfEmpty=true for manual run
    return;
  }

  // Default daemon/scheduler mode
  const config = await loadJSON(CONFIG_PATH);
  const telegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || config.telegram.botToken,
    targetChatId: process.env.TELEGRAM_CHAT_ID || config.telegram.targetChatId
  };

  // Start the interactive command listener
  startListener(telegramConfig, runAggregation).catch(console.error);

  const schedules = config.schedule || [];

  if (schedules.length === 0) {
    console.warn('[Scheduler] Warning: No schedules defined in config.json. The service will run but won\'t trigger scheduled crawls.');
    return;
  }

  console.info(`[Scheduler] Starting TeleDebrief in scheduler mode.`);
  console.info(`[Scheduler] Loaded channels: ${config.sources.filter(s => s.enabled).map(s => `@${s.username}`).join(', ')}`);
  console.info(`[Scheduler] Active schedules: ${schedules.join(', ')}`);

  for (const timeStr of schedules) {
    const parts = timeStr.split(':');
    if (parts.length !== 2) {
      console.error(`[Scheduler Error] Invalid time format in schedule: "${timeStr}". Must be "HH:MM" (e.g. "09:00").`);
      continue;
    }

    const [hourStr, minuteStr] = parts;
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      console.error(`[Scheduler Error] Invalid time values: "${timeStr}". Hour must be 0-23, minute 0-59.`);
      continue;
    }

    // Construct standard cron pattern for daily execution at specific HH:MM
    const cronPattern = `${minute} ${hour} * * *`;

    cron.schedule(cronPattern, async () => {
      await runAggregation(timeStr, false, false); // notifyIfEmpty=false for scheduled
    });

    console.info(`[Scheduler] Successfully scheduled job for ${timeStr} (Cron: ${cronPattern})`);
  }

  console.info('[Scheduler] TeleDebrief daemon is active. Keep this process running to capture updates.\n');
}

start().catch(err => {
  console.error('[Fatal Error] Application crashed on startup:', err);
  process.exit(1);
});
