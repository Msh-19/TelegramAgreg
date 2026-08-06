# TeleDebrief

A headless, configuration-driven Telegram channel news aggregator. Scrapes public Telegram channels, categorizes posts by keyword-based tags, and delivers beautifully formatted HTML debrief summaries to your Telegram channel 2 times per day.

## Features

- **No Telegram API credentials required** — scrapes public web previews (`t.me/s/{channel}`). No phone number, API ID, or session login needed.
- **Custom tagging** — define keyword-to-tag rules in `config.json`. Posts get auto-categorized.
- **2x daily debriefs** — configurable schedule sends tagged summaries to your Telegram bot/channel.
- **HTML formatted messages** — immune to Telegram's markdown parsing quirks with special characters.
- **Silent first-run initialization** — bootstraps baseline post IDs to avoid flooding your channel with history.
- **Exponential backoff retry** — resilient scraper handles transient network errors.
- **Single-assignment deduplication** — each post appears under exactly one tag (priority-based).

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather).
2. Send `/newbot` and follow the prompts.
3. Copy the **bot token** (looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).

### 2. Get your Target Chat ID

- **For a channel**: Create a channel, add your bot as an **Administrator** with "Post Messages" permission. Send any message in the channel, then visit:
  `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
  The `chat.id` field is your target. If negative (e.g. `-1001234567890`), use the raw number. If your channel is public, you can also use `@channelusername`.
- **For private chat**: Send a message to your bot, then check the same URL above — your `chat.id` will be your user ID.

### 3. Configure

Edit `config.json`:

```json
{
  "telegram": {
    "botToken": "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
    "targetChatId": "@MyNewsChannel"
  },
  "schedule": [
    "12:00",
    "22:00"
  ],
  "sources": [
    { "username": "durov", "enabled": true },
    { "username": "techcrunch", "enabled": false }
  ],
  "tags": [
    {
      "name": "AI",
      "keywords": ["ai", "openai", "gpt", "llm", "claude", "gemini", "artificial intelligence"]
    },
    {
      "name": "Crypto",
      "keywords": ["bitcoin", "btc", "crypto", "ethereum", "solana", "blockchain", "ton"]
    }
  ],
  "defaultTag": "Other"
}
```

### 4. Install & Run
...
## Deploying to Railway (Recommended)

To host 24/7 on Railway without keeping your computer on:

1.  **Push your code** to a GitHub repository.
2.  **Login to [Railway](https://railway.app/)** and click "New Project" -> "Deploy from GitHub repo".
3.  **Add Environment Variables** in Railway's dashboard for your secrets (do *not* put these in `config.json` on GitHub):
    - `TELEGRAM_BOT_TOKEN`: `your-bot-token-here`
    - `TELEGRAM_CHAT_ID`: `@your-channel-id`
4.  Railway will automatically detect the Node.js project and deploy it.
5.  **Configure Cron**: Since Railway runs as a continuous service, the internal `node-cron` scheduler in `index.js` will now work perfectly 24/7.


## Interactive Bot Commands

Once your bot is running, you can interact with it directly in Telegram:

- `/help` — Lists these commands.
- `/status` — Checks bot health.
- `/listchannels` — Views your enabled/disabled channel subscriptions.
- `/debriefnow` — Triggers an immediate debrief for all enabled channels.
- `/addchannel <username>` — Sanity checks if a channel exists, then adds and enables it.
- `/addchannels <u1 u2 u3>` — Bulk sanity checks and adds multiple channels (space or comma separated).
- `/removechannel <username>` — Removes a channel from your subscriptions.

## Adding & Toggling Channels

Simply add the channel username to `sources` in `config.json` as an object: `{ "username": "channelname", "enabled": true }`.
To temporarily disable a channel without removing it, set `"enabled": false`.
On next run, it will silently bootstrap without flooding your feed with old posts.
