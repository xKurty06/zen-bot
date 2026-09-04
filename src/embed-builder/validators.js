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

function validateConfiguration(configuration) {
  const embed = configuration.embed || {};
  const fields = embed.fields || [];
  const buttons = configuration.buttons || [];
  const errors = [];
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
    pushLimit(errors, `Field ${index + 1} name`, len(field.name), LIMITS.fieldName);
    pushLimit(errors, `Field ${index + 1} value`, len(field.value), LIMITS.fieldValue);
  });

  if (buttons.length > LIMITS.buttons) errors.push(`Too many buttons. Current: ${buttons.length}. Maximum: ${LIMITS.buttons}.`);
  if (Math.ceil(buttons.length / LIMITS.buttonsPerRow) > LIMITS.actionRows) {
    errors.push(`Too many button rows. Maximum: ${LIMITS.actionRows}.`);
  }
  buttons.forEach((button, index) => {
    pushLimit(errors, `Button ${index + 1} label`, len(button.label), LIMITS.buttonLabel);
    if (!button.url) errors.push(`Button ${index + 1} is missing a URL.`);
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
