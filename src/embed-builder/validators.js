const LIMITS = {
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  totalCharacters: 6000,
  buttons: 25,
  actionRows: 5,
  buttonsPerRow: 5,
  buttonLabel: 80,
};

function len(value) {
  return value ? String(value).length : 0;
}

function totalCharacters(embed) {
  return (
    len(embed.title) +
    len(embed.description) +
    len(embed.author?.name) +
    len(embed.footer?.text) +
    (embed.fields || []).reduce((sum, field) => sum + len(field.name) + len(field.value), 0)
  );
}

function pushLimit(errors, label, current, maximum) {
  if (current > maximum) {
    errors.push(`${label} is too long. Current: ${current}. Maximum: ${maximum}.`);
  }
}

function validateText(errors, label, value) {
  if (value != null && typeof value !== 'string') errors.push(`${label} must be text.`);
}

function validateUrl(errors, label, value, requireHttps = false) {
  if (!value) return;
  if (typeof value !== 'string') {
    errors.push(`${label} must be a URL.`);
    return;
  }
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    if (requireHttps && url.protocol !== 'https:') throw new Error();
  } catch {
    errors.push(`${label} must be a valid ${requireHttps ? 'https://' : 'http(s)://'} URL.`);
  }
}

function validateEmoji(errors, label, value) {
  if (!value) return;
  if (typeof value !== 'string') {
    errors.push(`${label} must be an emoji string.`);
    return;
  }
  if (value.includes('<') && !/^<a?:[A-Za-z0-9_~]+:\d{17,20}>$/.test(value)) {
    errors.push(`${label} is malformed.`);
  }
}

function validateConfiguration(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return ['Embed configuration must be an object.'];
  const embed = configuration.embed || {};
  if (!embed || typeof embed !== 'object' || Array.isArray(embed)) return ['Embed configuration is missing a valid embed object.'];
  const fields = embed.fields || [];
  const buttons = configuration.buttons || [];
  const errors = [];
  if (!Array.isArray(fields)) return ['Embed fields must be a list.'];
  if (!Array.isArray(buttons)) return ['Embed buttons must be a list.'];
  validateText(errors, 'Title', embed.title);
  validateText(errors, 'Description', embed.description);
  validateText(errors, 'Embed URL', embed.url);
  validateText(errors, 'Thumbnail URL', embed.thumbnail);
  validateText(errors, 'Image URL', embed.image);
  validateUrl(errors, 'Embed URL', embed.url);
  validateUrl(errors, 'Thumbnail URL', embed.thumbnail, true);
  validateUrl(errors, 'Image URL', embed.image, true);
  if (embed.color != null && (typeof embed.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(embed.color))) errors.push('Color must be a hex value like #5865F2.');
  if (embed.timestamp != null && typeof embed.timestamp !== 'boolean') errors.push('Timestamp must be a boolean.');
  if (embed.author != null && (typeof embed.author !== 'object' || Array.isArray(embed.author))) errors.push('Author must be an object.');
  if (embed.footer != null && (typeof embed.footer !== 'object' || Array.isArray(embed.footer))) errors.push('Footer must be an object.');
  validateText(errors, 'Author name', embed.author?.name);
  validateText(errors, 'Footer text', embed.footer?.text);
  validateUrl(errors, 'Author URL', embed.author?.url);
  validateUrl(errors, 'Author icon URL', embed.author?.iconUrl, true);
  validateUrl(errors, 'Footer icon URL', embed.footer?.iconUrl, true);
  const hasEmbedContent = Boolean(
    embed.title ||
    embed.description ||
    embed.url ||
    embed.author?.name ||
    embed.footer?.text ||
    embed.thumbnail ||
    embed.image ||
    fields.length,
  );

  if (!hasEmbedContent) {
    errors.push('Add at least one embed property before saving or sending.');
  }

  pushLimit(errors, 'Title', len(embed.title), LIMITS.title);
  pushLimit(errors, 'Description', len(embed.description), LIMITS.description);
  pushLimit(errors, 'Author name', len(embed.author?.name), LIMITS.authorName);
  pushLimit(errors, 'Footer text', len(embed.footer?.text), LIMITS.footerText);
  pushLimit(errors, 'Embed total text', totalCharacters(embed), LIMITS.totalCharacters);

  if (fields.length > LIMITS.fields) errors.push(`Too many fields. Current: ${fields.length}. Maximum: ${LIMITS.fields}.`);
  fields.forEach((field, index) => {
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      errors.push(`Field ${index + 1} is malformed.`);
      return;
    }
    if (!String(field.name || '').trim()) errors.push(`Field ${index + 1} needs a name.`);
    if (!String(field.value || '').trim()) errors.push(`Field ${index + 1} needs a value.`);
    validateText(errors, `Field ${index + 1} name`, field.name);
    validateText(errors, `Field ${index + 1} value`, field.value);
    if (field.inline != null && typeof field.inline !== 'boolean') errors.push(`Field ${index + 1} inline must be boolean.`);
    pushLimit(errors, `Field ${index + 1} name`, len(field.name), LIMITS.fieldName);
    pushLimit(errors, `Field ${index + 1} value`, len(field.value), LIMITS.fieldValue);
  });

  if (buttons.length > LIMITS.buttons) errors.push(`Too many buttons. Current: ${buttons.length}. Maximum: ${LIMITS.buttons}.`);
  if (Math.ceil(buttons.length / LIMITS.buttonsPerRow) > LIMITS.actionRows) {
    errors.push(`Too many button rows. Maximum: ${LIMITS.actionRows}.`);
  }
  buttons.forEach((button, index) => {
    if (!button || typeof button !== 'object' || Array.isArray(button)) {
      errors.push(`Button ${index + 1} is malformed.`);
      return;
    }
    if (!String(button.label || '').trim()) errors.push(`Button ${index + 1} needs a label.`);
    validateText(errors, `Button ${index + 1} label`, button.label);
    validateText(errors, `Button ${index + 1} URL`, button.url);
    validateEmoji(errors, `Button ${index + 1} emoji`, button.emoji);
    pushLimit(errors, `Button ${index + 1} label`, len(button.label), LIMITS.buttonLabel);
    if (!button.url) errors.push(`Button ${index + 1} is missing a URL.`);
    else {
      try {
        const url = new URL(button.url);
        if (url.protocol !== 'https:') errors.push(`Button ${index + 1} URL must use https://.`);
      } catch {
        errors.push(`Button ${index + 1} has an invalid URL.`);
      }
    }
  });

  return errors;
}

function assertValidConfiguration(configuration) {
  const errors = validateConfiguration(configuration);
  if (errors.length) {
    const error = new Error(errors.join('\n'));
    error.validationErrors = errors;
    throw error;
  }
}

module.exports = { LIMITS, validateConfiguration, assertValidConfiguration };
