import { fileURLToPath } from 'url';
import path from 'path';
import { scrapeChannel } from './scraper.js';
import { groupPostsByTag, compileDebriefMessages } from './processor.js';
import { sendDebrief } from './sender.js';
import { loadJSON, saveJSON } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, 'state.json');

/**
 * Seeds baseline post IDs for any newly-added channels to avoid flooding on startup.
 */
export async function bootstrapState() {
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
 */
export async function runAggregation(runTypeLabel, isTestMode = false, notifyIfEmpty = false) {
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

  allNewPosts.sort((a, b) => new Date(a.date) - new Date(b.date));
  const grouped = groupPostsByTag(allNewPosts, config.tags, config.defaultTag);
  const messages = compileDebriefMessages(grouped, runTypeLabel);
  const sendSuccess = await sendDebrief(messages, telegramConfig, isTestMode);

  if (sendSuccess && !isTestMode) {
    const updatedState = { ...state, ...pendingStateUpdates };
    await saveJSON(STATE_PATH, updatedState);
    console.info('[Aggregator] State updated and saved successfully.');
  }

  console.info(`--- Aggregation [${runTypeLabel}] finished ---\n`);
}
