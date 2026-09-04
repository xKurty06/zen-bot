const redactPatterns = [/token/i, /secret/i, /password/i, /authorization/i];

function sanitize(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      redactPatterns.some((pattern) => pattern.test(key)) ? '[REDACTED]' : entry,
    ]),
  );
}

function log(level, message, meta) {
  const line = `[${level}] ${message}`;
  if (meta === undefined) {
    console.log(line);
    return;
  }
  console.log(line, sanitize(meta));
}

module.exports = {
  info: (message, meta) => log('INFO', message, meta),
  warn: (message, meta) => log('WARN', message, meta),
  error: (message, meta) => log('ERROR', message, meta),
};
