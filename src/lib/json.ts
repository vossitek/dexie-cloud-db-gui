import type { JsonValue } from '../../shared/contracts';

type Frame =
  | { kind: 'value'; value: JsonValue }
  | { kind: 'array'; value: JsonValue[]; index: number }
  | { kind: 'object'; entries: [string, JsonValue][]; index: number };

// JSON received through the API is acyclic. This fallback avoids native
// stringifier recursion limits while still escaping keys and scalar strings.
function stringifyDeep(value: JsonValue): string {
  const stack: Frame[] = [{ kind: 'value', value }];
  const parts: string[] = [];
  while (stack.length) {
    const frame = stack.pop()!;
    if (frame.kind === 'array') {
      if (frame.index === frame.value.length) {
        parts.push(']');
        continue;
      }
      if (frame.index > 0) parts.push(',');
      stack.push({ ...frame, index: frame.index + 1 });
      stack.push({ kind: 'value', value: frame.value[frame.index]! });
    } else if (frame.kind === 'object') {
      const entry = frame.entries[frame.index];
      if (!entry) {
        parts.push('}');
        continue;
      }
      if (frame.index > 0) parts.push(',');
      parts.push(JSON.stringify(entry[0]), ':');
      stack.push({ ...frame, index: frame.index + 1 });
      stack.push({ kind: 'value', value: entry[1] });
    } else if (frame.value !== null && typeof frame.value === 'object') {
      if (Array.isArray(frame.value)) {
        parts.push('[');
        stack.push({ kind: 'array', value: frame.value, index: 0 });
      } else {
        parts.push('{');
        stack.push({
          kind: 'object',
          entries: Object.entries(frame.value),
          index: 0,
        });
      }
    } else parts.push(JSON.stringify(frame.value));
  }
  return parts.join('');
}

function isShallow(text: string): boolean {
  let quoted = false;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '\\') index++;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '[' || character === '{') {
      if (++depth > 32) return false;
    } else if (character === ']' || character === '}') depth--;
  }
  return true;
}

export function formatJson(value: JsonValue): string {
  let compact: string;
  try {
    compact = JSON.stringify(value);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return stringifyDeep(value);
  }
  // Keep large/deep records usable without discarding any of their values.
  return compact.length <= 64 * 1024 && isShallow(compact)
    ? JSON.stringify(value, null, 2)
    : compact;
}
