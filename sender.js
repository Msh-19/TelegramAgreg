import axios from 'axios';

/**
 * Dispatches a list of compiled debrief HTML messages to Telegram.
 * Supports a "dry-run" mode to print directly to console when credentials are placeholders.
 * 
 * @param {string[]} messages - Array of compiled HTML message chunks.
 * @param {Object} credentials - The Telegram bot credentials.
 * @param {string} credentials.botToken - The Telegram Bot Token.
 * @param {string} credentials.targetChatId - The Target Chat ID or Channel Username.
 * @param {boolean} [isDryRun=false] - If true, prints to console instead of invoking the API.
 * @returns {Promise<boolean>} - True if all messages sent successfully, false otherwise.
 */
export async function sendDebrief(messages, credentials, isDryRun = false) {
  const { botToken, targetChatId } = credentials;

  // Detect default/placeholder settings to automatically fall back to terminal log for easy setup
  const isPlaceholder = !botToken || 
                        botToken.includes('YOUR_BOT_TOKEN_HERE') || 
                        !targetChatId || 
                        targetChatId.includes('YOUR_CHAT_OR_CHANNEL_ID_HERE');

  if (isDryRun || isPlaceholder) {
    console.info('\n--- [DRY-RUN / PLAYBACK MODE] ---');
    console.info('To deliver live to Telegram, update botToken and targetChatId in config.json.');
    console.info(`Target Chat ID: ${targetChatId || 'Not Configured'}`);
    console.info(`Message Chunks: ${messages.length}\n`);

    messages.forEach((msg, idx) => {
      console.info(`--- Message Chunk ${idx + 1} ---`);
      console.info(msg);
      console.info('-----------------------------\n');
    });

    console.info('--- [END OF PLAYBACK] ---\n');
    return true;
  }

  console.info(`[Sender] Dispatching ${messages.length} message(s) to Telegram chat: ${targetChatId}...`);

  for (let i = 0; i < messages.length; i++) {
    const text = messages[i];
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
      await axios.post(url, {
        chat_id: targetChatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true // Disables link preview cards to keep channel super clean and compact
      });
      console.info(`[Sender] Message chunk ${i + 1}/${messages.length} sent successfully.`);
      
      // Delay slightly between chunks to respect Telegram rate limit bounds
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`[Sender Error] Failed to send message chunk ${i + 1}/${messages.length}:`);
      if (err.response && err.response.data) {
        console.error(`  Telegram API Error: Code ${err.response.data.error_code} - ${err.response.data.description}`);
        if (err.response.data.error_code === 401) {
          console.error('  -> Recommendation: Check if your Bot Token in config.json is correct.');
        } else if (err.response.data.error_code === 403 || err.response.data.error_code === 400) {
          console.error('  -> Recommendation: Ensure the bot is added as an administrator to the target channel with "Post Messages" permission, or that you have initiated a chat with the bot.');
        }
      } else {
        console.error(`  Error: ${err.message}`);
      }
      return false;
    }
  }

  return true;
}
