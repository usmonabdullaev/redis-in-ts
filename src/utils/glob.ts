/**
 * Converts a Redis glob pattern into a regular expression.
 * Redis glob syntax:
 *   * -> matches any characters
 *   ? -> matches single character
 *   [abc] -> character class
 *   [a-z] -> character range
 *   \x -> escaped character
 */
export function globToRegex(pattern: string): RegExp {
  let regexStr = '^';
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (char === '\\' && i + 1 < pattern.length) {
      regexStr += '\\' + pattern[++i];
    } else if (char === '*' && !inClass) {
      regexStr += '.*';
    } else if (char === '?' && !inClass) {
      regexStr += '.';
    } else if (char === '[' && !inClass) {
      inClass = true;
      regexStr += '[';
      // Handle negation if next is ! or ^
      if (i + 1 < pattern.length && (pattern[i + 1] === '^' || pattern[i + 1] === '!')) {
        regexStr += '^';
        i++;
      }
    } else if (char === ']' && inClass) {
      inClass = false;
      regexStr += ']';
    } else {
      // Escape special regex characters if not inside []
      if (!inClass && /[.+^${}()|[\]\\]/.test(char!)) {
        regexStr += '\\' + char;
      } else {
        regexStr += char;
      }
    }
  }

  regexStr += '$';
  return new RegExp(regexStr);
}

export function matchGlob(pattern: string, target: string): boolean {
  if (pattern === '*') return true;
  return globToRegex(pattern).test(target);
}
