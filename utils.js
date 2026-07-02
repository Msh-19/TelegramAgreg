import fs from 'fs/promises';

/**
 * Loads a JSON file safely.
 */
export async function loadJSON(filePath, defaultValue = {}) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return defaultValue;
    }
    console.error(`[Error] Failed to read JSON file at ${filePath}:`, err.message);
    throw err;
  }
}

/**
 * Saves a JSON file safely.
 */
export async function saveJSON(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[Error] Failed to write JSON file at ${filePath}:`, err.message);
    throw err;
  }
}
