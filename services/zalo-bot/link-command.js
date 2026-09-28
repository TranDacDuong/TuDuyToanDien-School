'use strict';

const LINK_COMMAND_PATTERN = /(?:^|\n)#lienket_((?:0\d{9})|(?:84\d{9}))\s*$/i;
const DEFAULT_ALIAS_LIMIT = 40;

function parseParentLinkCommand(content) {
  if (typeof content !== 'string' || content.length > 2000) return null;
  const match = content.trim().match(LINK_COMMAND_PATTERN);
  return match ? { phone: match[1] } : null;
}

function lastNameWords(name, count = 2) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).slice(-count).join(' ');
}

function truncateAtWord(value, maxLength) {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;
  const shortened = characters.slice(0, maxLength).join('').replace(/\s+\S*$/, '').trim();
  return shortened || characters.slice(0, maxLength).join('').trim();
}

function buildParentAlias(studentNames, parentPhone, maxLength = DEFAULT_ALIAS_LIMIT) {
  const lastFour = String(parentPhone || '').replace(/\D/g, '').slice(-4);
  if (lastFour.length !== 4) throw new Error('Số điện thoại phụ huynh không hợp lệ');

  const seen = new Set();
  const names = (Array.isArray(studentNames) ? studentNames : [])
    .map(name => lastNameWords(name))
    .filter(name => {
      const key = name.toLocaleLowerCase('vi');
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const safeNames = names.length ? names : ['Học sinh'];
  const fullAlias = `PH ${safeNames.join(' - ')} ${lastFour}`;
  if (Array.from(fullAlias).length <= maxLength) return fullAlias;

  if (safeNames.length === 1) {
    const suffix = ` ${lastFour}`;
    const available = Math.max(1, maxLength - Array.from(`PH${suffix}`).length - 1);
    return `PH ${truncateAtWord(safeNames[0], available)}${suffix}`;
  }
  const suffix = ` +${safeNames.length - 1} ${lastFour}`;
  const available = Math.max(1, maxLength - Array.from(`PH${suffix}`).length - 1);
  return `PH ${truncateAtWord(safeNames[0], available)}${suffix}`;
}

module.exports = { buildParentAlias, parseParentLinkCommand };
