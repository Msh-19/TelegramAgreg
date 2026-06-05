import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Fetches a URL with exponential backoff retry logic.
 * @param {string} url - The URL to fetch.
 * @param {number} retries - Maximum number of retries.
 * @param {number} baseDelay - Initial delay in milliseconds.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function fetchWithRetry(url, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        timeout: 10000
      });
    } catch (err) {
      const isLastAttempt = attempt === retries - 1;
      if (isLastAttempt) {
        throw new Error(`Failed to fetch ${url} after ${retries} attempts. Original error: ${err.message}`);
      }
      const backoff = baseDelay * Math.pow(2, attempt);
      console.warn(`[Scraper] Attempt ${attempt + 1} failed for ${url}. Retrying in ${backoff}ms... (${err.message})`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

/**
 * Checks if a channel exists by attempting to fetch its public preview.
 * @param {string} channelUsername 
 * @returns {Promise<boolean>}
 */
export async function checkChannelExists(channelUsername) {
  const username = channelUsername.replace(/^@/, '').trim();
  try {
    await axios.get(`https://t.me/s/${username}`, { timeout: 5000 });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Fetches basic channel metadata (title and avatar URL) for preview.
 * @param {string} channelUsername 
 * @returns {Promise<{title: string, avatarUrl: string|null}>}
 */
export async function getChannelPreview(channelUsername) {
  const username = channelUsername.replace(/^@/, '').trim();
  try {
    const { data } = await axios.get(`https://t.me/s/${username}`, { timeout: 5000 });
    const $ = cheerio.load(data);
    
    const title = $('.tgme_channel_info_header_title').text().trim();
    const avatarUrl = $('.tgme_page_photo_image').attr('src');
    
    return { title, avatarUrl: avatarUrl || null };
  } catch (err) {
    return { title: 'Unknown', avatarUrl: null };
  }
}

/**
 * Scrapes a public Telegram channel's web preview.
 * @param {string} channelUsername - The public username of the channel (e.g. "techcrunch").
 * @returns {Promise<Array<{id: number, text: string, date: Date, url: string}>>}
 */
export async function scrapeChannel(channelUsername) {
  // Clean the username (remove @ if present)
  const username = channelUsername.replace(/^@/, '').trim();
  const url = `https://t.me/s/${username}`;

  try {
    const response = await fetchWithRetry(url);
    const $ = cheerio.load(response.data);
    const posts = [];

    $('.tgme_widget_message').each((_, el) => {
      // 1. Extract Post ID
      const dataPost = $(el).attr('data-post');
      if (!dataPost) return;

      const parts = dataPost.split('/');
      const id = parseInt(parts[parts.length - 1], 10);
      if (isNaN(id)) return;

      // 2. Extract Text Content (and preserve some basic text spacing if needed)
      const textEl = $(el).find('.tgme_widget_message_text');
      if (textEl.length === 0) return; // Skip media-only posts without captions or service messages

      const text = textEl.text().trim();
      if (!text) return;

      // 3. Extract Publish Date
      const timeEl = $(el).find('time');
      const datetime = timeEl.attr('datetime');
      const date = datetime ? new Date(datetime) : new Date();

      // 4. Create Direct Link
      const postUrl = `https://t.me/${username}/${id}`;

      posts.push({
        id,
        text,
        date,
        url: postUrl
      });
    });

    // Sort posts ascending by ID (oldest to newest) so we process them chronologically
    return posts.sort((a, b) => a.id - b.id);
  } catch (error) {
    console.error(`[Scraper Error] Error scraping channel ${channelUsername}:`, error.message);
    throw error;
  }
}
