import axios from 'axios';
import * as cheerio from 'cheerio';

async function findImages(username) {
  const url = `https://t.me/s/${username}`;
  const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(data);
  
  $('.tgme_widget_message_photo_wrap').each((i, el) => {
    console.log(`Image ${i}:`, $(el).attr('style'));
  });
}

await findImages('telegram');
