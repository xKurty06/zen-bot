const { DEFAULT_EMBED_COLOR } = require('../config/brand');

function parseUrl(value, { requireHttps = false } = {}) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid URL, including https:// or http://.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  if (requireHttps && url.protocol !== 'https:') {
    throw new Error('Use an https:// URL.');
  }
  return url.toString();
}

function parseColor(value) {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Enter a hex color like ${DEFAULT_EMBED_COLOR}.`);
  }
  return normalized.startsWith('#') ? normalized.toUpperCase() : `#${normalized.toUpperCase()}`;
}

function booleanFromInput(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['true', 'yes', 'y', '1', 'inline'].includes(String(value).trim().toLowerCase());
}

module.exports = { parseUrl, parseColor, booleanFromInput };
