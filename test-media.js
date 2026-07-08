import axios from 'axios';
import * as cheerio from 'cheerio';

async function testScrapeMedia(username) {
  const url = `https://t.me/s/${username}`;
  console.log(`Testing media extraction for: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    
    $('.tgme_widget_message').each((_, el) => {
      const photoEl = $(el).find('.tgme_widget_message_photo_wrap');
      if (photoEl.length > 0) {
        const style = photoEl.attr('style');
        // Extract URL from background-image: url(...)
        const match = style.match(/background-image:url\('(.*)'\)/);
        if (match) {
          console.log('Found photo URL:', match[1]);
        }
      }
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

await testScrapeMedia('telegram');
