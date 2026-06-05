import axios from 'axios';
import * as cheerio from 'cheerio';

async function testScrape(username) {
  const url = `https://t.me/s/${username}`;
  console.log(`Testing: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000
    });
    console.log(`Status: ${response.status}`);
    const $ = cheerio.load(response.data);
    const postCount = $('.tgme_widget_message').length;
    console.log(`Found ${postCount} posts.`);
    if (postCount === 0) {
      console.log('Sample HTML snippet:', response.data.substring(0, 500));
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

// Test with a known public channel not owned by the user (e.g., a generic news channel if durov doesn't work, but let's stick with durov/telegram for now)
await testScrape('durov');
await testScrape('telegram');
await testScrape('techcrunch');
