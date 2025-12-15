function clampText(str, maxLen) {
  const s = String(str ?? '');
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

function normalizeNewlines(s) {
  return String(s ?? '').replace(/\r\n/g, '\n');
}

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseColorToInt(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  // '#RRGGBB' or 'RRGGBB'
  const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return parseInt(m[1], 16);
}

function parseButtonsMultiline(text, maxButtons = 5) {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const buttons = [];
  const errors = [];

  for (const line of lines) {
    if (buttons.length >= maxButtons) break;

    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(line);
      continue;
    }
    const label = clampText(parts[0], 80);
    const url = parts[1];

    if (!label || !isHttpUrl(url)) {
      errors.push(line);
      continue;
    }
    buttons.push({ label, url });
  }

  return { buttons, errors };
}

function parseUrlsMultiline(text, maxChars = 1500) {
  const s = clampText(normalizeNewlines(text).trim(), maxChars);
  if (!s) return '';

  // 行単位で http(s) URL っぽいものだけ残す（それ以外はそのまま許容しない）
  const lines = s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const ok = [];
  for (const line of lines) {
    if (isHttpUrl(line)) ok.push(line);
  }

  return clampText(ok.join('\n'), maxChars);
}

function parseFieldsMultiline(text, maxFields = 25) {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const fields = [];
  const errors = [];

  for (const line of lines) {
    if (fields.length >= maxFields) break;

    // name|value|inline(optional true/false)
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) {
      errors.push(line);
      continue;
    }

    const name = clampText(parts[0], 256);
    const value = clampText(parts[1], 1024);
    const inlineRaw = (parts[2] ?? '').toLowerCase();
    const inline = inlineRaw === 'true' || inlineRaw === '1' || inlineRaw === 'yes';

    if (!name || !value) {
      errors.push(line);
      continue;
    }
    fields.push({ name, value, inline });
  }

  return { fields, errors };
}

function parseSelectMenu(text, placeholder, maxOptions = 25) {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const options = [];
  const errors = [];

  for (const line of lines) {
    if (options.length >= maxOptions) break;

    // label|value|description(optional)
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 1) continue;

    const label = clampText(parts[0] || '', 100);
    const value = clampText((parts[1] || parts[0] || ''), 100);
    const description = clampText((parts[2] || ''), 100);

    if (!label || !value) {
      errors.push(line);
      continue;
    }

    options.push({
      label,
      value,
      description: description || undefined,
    });
  }

  const ph = clampText(String(placeholder ?? '').trim(), 100) || 'Please select your choice';

  if (!options.length) return { selectMenu: null, errors };

  return {
    selectMenu: {
      placeholder: ph,
      options,
    },
    errors,
  };
}

module.exports = {
  clampText,
  normalizeNewlines,
  isHttpUrl,
  parseColorToInt,
  parseButtonsMultiline,
  parseUrlsMultiline,
  parseFieldsMultiline,
  parseSelectMenu,
};
