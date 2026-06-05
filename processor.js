/**
 * Helper to escape HTML characters so Telegram's HTML parse mode doesn't reject them.
 * @param {string} text - Raw input text.
 * @returns {string} - Escaped text safe for HTML parse mode.
 */
export function escapeHTML(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Truncates text to a specified maximum length, ensuring it ends cleanly.
 * @param {string} text - The text to truncate.
 * @param {number} maxLength - Maximum character count.
 * @returns {string} - Truncated text with an ellipsis.
 */
export function truncateText(text, maxLength = 200) {
  if (!text) return '';
  // Clean up excessive whitespace and newlines for compact bullet representation
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (cleanText.length <= maxLength) {
    return cleanText;
  }
  return cleanText.substring(0, maxLength - 3) + '...';
}

/**
 * Categorizes and aggregates raw posts based on priority-based keyword matching.
 * Implements single-assignment deduplication: once a post is assigned a tag,
 * it is skipped for subsequent tags.
 * 
 * @param {Array<{id: number, text: string, date: Date, url: string, channel: string}>} allPosts - All scraped posts.
 * @param {Array<{name: string, keywords: string[]}>} tagsConfig - The list of tags and their keywords from config.json.
 * @param {string} defaultTagName - Name of the fallback tag (e.g. "Other").
 * @returns {Record<string, Array<any>>} - Posts grouped by tag name.
 */
export function groupPostsByTag(allPosts, tagsConfig, defaultTagName = 'Other') {
  const groups = {};

  // Initialize all defined groups + the default fallback group
  for (const tag of tagsConfig) {
    groups[tag.name] = [];
  }
  groups[defaultTagName] = [];

  for (const post of allPosts) {
    let matched = false;
    const postTextLower = post.text.toLowerCase();

    // Priority-based tag assignment
    for (const tag of tagsConfig) {
      const matchFound = tag.keywords.some(keyword => 
        postTextLower.includes(keyword.toLowerCase())
      );

      if (matchFound) {
        groups[tag.name].push(post);
        matched = true;
        break; // Stop checking other tags (Single Assignment Deduplication)
      }
    }

    if (!matched) {
      groups[defaultTagName].push(post);
    }
  }

  // Filter out empty groups so we don't display headers with zero posts
  const activeGroups = {};
  for (const [tagName, posts] of Object.entries(groups)) {
    if (posts.length > 0) {
      activeGroups[tagName] = posts;
    }
  }

  return activeGroups;
}

/**
 * Compiles grouped posts into a beautifully formatted list of HTML messages,
 * respecting Telegram's 4096 character limit per message.
 * 
 * @param {Record<string, Array<{id: number, text: string, date: Date, url: string, channel: string}>>} groupedPosts - Grouped posts.
 * @param {string} timeString - Current timing string (e.g. "09:00" or "Manual Run").
 * @returns {string[]} - Array of HTML messages ready to send.
 */
export function compileDebriefMessages(groupedPosts, timeString) {
  const MAX_TELEGRAM_MSG_LEN = 4000; // Leave buffer below 4096
  const messages = [];

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  let currentMsg = `📅 <b>TeleDebrief Summary — ${dateFormatted} (${timeString})</b>\n\n`;

  const keys = Object.keys(groupedPosts);
  if (keys.length === 0) {
    return [`📅 <b>TeleDebrief Summary — ${dateFormatted} (${timeString})</b>\n\n<i>No new updates found during this period.</i>`];
  }

  for (const tagName of keys) {
    const posts = groupedPosts[tagName];
    let tagSection = `🏷️ <b>#${escapeHTML(tagName)}</b>\n`;

    for (const post of posts) {
      const escapedText = escapeHTML(truncateText(post.text, 180));
      const postLine = `• ${escapedText} <i>(via @${escapeHTML(post.channel)})</i> — <a href="${post.url}">View Post</a>\n`;

      // If adding this post line to the section exceeds the total limits
      if (currentMsg.length + tagSection.length + postLine.length > MAX_TELEGRAM_MSG_LEN) {
        // If currentMsg already has content, push it to results and start a new message
        if (currentMsg.trim().length > 0) {
          // Add whatever tag section has been built so far (if any)
          if (tagSection !== `🏷️ <b>#${escapeHTML(tagName)}</b>\n`) {
            currentMsg += tagSection;
          }
          messages.push(currentMsg);
          currentMsg = `📅 <b>TeleDebrief Summary (Cont.)</b>\n\n`;
          // Reset tagSection for the new message
          tagSection = `🏷️ <b>#${escapeHTML(tagName)} (Cont.)</b>\n`;
        }
      }

      tagSection += postLine;
    }

    currentMsg += tagSection + '\n';
  }

  if (currentMsg.trim().length > 0) {
    messages.push(currentMsg);
  }

  return messages;
}
