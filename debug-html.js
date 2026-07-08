import axios from 'axios';
import * as cheerio from 'cheerio';

async function debugHTML(username) {
  const url = `https://t.me/s/${username}`;
  const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(response.data);
  
  // Log the first message's inner HTML to see structure
  const firstMsg = $('.tgme_widget_message').first().html();
  console.log('Snippet of first message HTML:', firstMsg.substring(0, 500));
}

await debugHTML('telegram');
