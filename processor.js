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
 * Implements deduplication and filtering.
 */
export function groupPostsByTag(allPosts, tagsConfig, defaultTagName = 'Other', blockedKeywords = []) {
  const groups = {};
  const seenContent = new Set(); // Global deduplication set

  // Initialize groups
  for (const tag of tagsConfig) groups[tag.name] = [];
  groups[defaultTagName] = [];

  for (const post of allPosts) {
    const postTextLower = post.text.toLowerCase();

    // 1. Content Filtering (Faith-based)
    const isBlocked = blockedKeywords.some(keyword => 
      postTextLower.includes(keyword.toLowerCase())
    );
    if (isBlocked) continue;

    // 2. Global Deduplication
    if (seenContent.has(post.text)) continue;
    seenContent.add(post.text);

    // 3. Priority Tag Assignment
    let matched = false;
    for (const tag of tagsConfig) {
      if (tag.keywords.some(k => postTextLower.includes(k.toLowerCase()))) {
        groups[tag.name].push(post);
        matched = true;
        break; 
      }
    }

    if (!matched) groups[defaultTagName].push(post);
  }

  // Filter empty groups
  return Object.fromEntries(Object.entries(groups).filter(([_, posts]) => posts.length > 0));
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
