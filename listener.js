import axios from 'axios';
import fs from 'fs/promises';
import { checkChannelExists, getChannelPreview } from './scraper.js';

let lastUpdateId = 0;

export async function startListener(credentials, runAggregationFunc) {
  const { botToken } = credentials;
  console.info('[Listener] Command listener active.');

  while (true) {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`, {
        params: { offset: lastUpdateId + 1, timeout: 30 }
      });

      for (const update of response.data.result) {
        lastUpdateId = update.update_id;
        if (update.message && update.message.text) {
          await handleMessage(update.message, credentials, runAggregationFunc);
        }
      }
    } catch (err) {
      console.error('[Listener Error]', err.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function sendLoading(chatId, botToken) {
  const { data } = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId, text: "⏳ <i>Processing your request...</i>", parse_mode: 'HTML'
  });
  return data.result.message_id;
}

async function deleteMessage(chatId, messageId, botToken) {
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/deleteMessage`, { chat_id: chatId, message_id: messageId });
  } catch (e) { /* ignore */ }
}

async function sendPreview(chatId, botToken, username, preview) {
  const caption = `✅ <b>Added & Enabled @${username}</b>\n<i>${preview.title}</i>\n\nIf this is incorrect, run /removechannel @${username}`;
  if (preview.avatarUrl) {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, { chat_id: chatId, photo: preview.avatarUrl, caption, parse_mode: 'HTML' });
  } else {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: caption, parse_mode: 'HTML' });
  }
}

async function handleMessage(message, credentials, runAggregationFunc) {
  const { botToken } = credentials;
  const chatId = message.chat.id;
  const text = message.text;

  let reply = '';

  if (text.startsWith('/start') || text.startsWith('/help')) {
    reply = `👋 <b>TeleDebrief Assistant</b>\n\n` +
            `/status — Check bot health\n` +
            `/listchannels — View your subscriptions\n` +
            `/debriefnow — Trigger immediate debrief\n` +
            `/addchannels <i>u1 u2</i> — Bulk add\n` +
            `/removechannel <i>@username</i> — Remove`;
  } else if (text === '/status') {
    reply = `✅ <b>Bot is running normally.</b>`;
  } else if (text === '/listchannels') {
    const loadingMsgId = await sendLoading(chatId, botToken);
    const config = JSON.parse(await fs.readFile('./config.json', 'utf-8'));
    reply = `📊 <b>Your Channel Subscriptions</b>\n\n` +
            `<b>Enabled:</b>\n${config.sources.filter(s => s.enabled).map(s => `• @${s.username}`).join('\n') || 'None'}\n\n` +
            `<b>Disabled:</b>\n${config.sources.filter(s => !s.enabled).map(s => `• @${s.username}`).join('\n') || 'None'}`;
    await deleteMessage(chatId, loadingMsgId, botToken);
  } else if (text === '/debriefnow') {
    const loadingMsgId = await sendLoading(chatId, botToken);
    reply = `✅ <b>Manual debrief triggered.</b>`;
    runAggregationFunc('Manual Run', false, true).then(() => deleteMessage(chatId, loadingMsgId, botToken)).catch(console.error);
  } else if (text.startsWith('/addchannels ')) {
    const loadingMsgId = await sendLoading(chatId, botToken);
    const usernames = text.substring(13).trim().split(/[\s,]+/).filter(u => u.length > 0);
    const config = JSON.parse(await fs.readFile('./config.json', 'utf-8'));
    const added = [], failed = [], exists = [];

    for (const username of usernames) {
      const cleanUsername = username.replace(/^@/, '');
      if (config.sources.find(s => s.username === cleanUsername)) {
        exists.push(cleanUsername);
      } else if (await checkChannelExists(cleanUsername)) {
        config.sources.push({ username: cleanUsername, enabled: true });
        added.push(cleanUsername);
      } else {
        failed.push(cleanUsername);
      }
    }
    await fs.writeFile('./config.json', JSON.stringify(config, null, 2));
    reply = `✅ <b>Result:</b>\n` + (added.length ? `Added: ${added.join(', ')}\n` : '') + (exists.length ? `Exists: ${exists.join(', ')}\n` : '') + (failed.length ? `Failed: ${failed.join(', ')}` : '');
    await deleteMessage(chatId, loadingMsgId, botToken);
  } else if (text.startsWith('/removechannel ')) {
    const username = text.split(' ')[1].replace(/^@/, '').trim();
    const config = JSON.parse(await fs.readFile('./config.json', 'utf-8'));
    const initialLength = config.sources.length;
    config.sources = config.sources.filter(s => s.username !== username);
    if (config.sources.length < initialLength) {
      await fs.writeFile('./config.json', JSON.stringify(config, null, 2));
      reply = `🗑️ <b>Channel @${username} removed.</b>`;
    } else {
      reply = `ℹ️ <b>Channel @${username} not found.</b>`;
    }
  }

  if (reply) {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: reply, parse_mode: 'HTML' });
  }
}
