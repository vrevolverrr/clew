import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { attachmentFilePath, type ChatAttachment, fileText, INLINE_MAX_BYTES, INLINE_MAX_LINES, isImageMediaType, isStored, mediaTypeOfExtension, mentionPaths, readTexts, turnFiles, turnImages } from '@/context/ChatAttachment';

const FILE: ChatAttachment = { kind: 'file', path: '/v/notes/Week 1.md', name: 'Week 1.md' };
const MENTION: ChatAttachment = { kind: 'file', path: '/v/b.md', name: 'b.md', token: 'b.md' };
const IMAGE: ChatAttachment = { kind: 'image', path: 'p/attachments/c/a.png', mediaType: 'image/png', name: 'a.png' };
const PASTE: ChatAttachment = { kind: 'paste', path: 'p/attachments/c/ab.txt', name: 'Pasted text · 900 lines' };
const mention = (path: string): string | undefined => (path.includes('"') ? undefined : `@${path}`);

describe('turnFiles', () => {
  it('has the agent load a file itself when it can, and leaves out an image', () => {
    expect(turnFiles([FILE, IMAGE], '/v', mention)).toEqual([{ path: '/v/notes/Week 1.md', mention: '@/v/notes/Week 1.md' }]);
  });

  it('carries a file for an agent that does not load mentions', () => {
    expect(turnFiles([FILE], '/v')).toEqual([{ path: '/v/notes/Week 1.md' }]);
  });

  it('always carries a paste, by its absolute path', () => {
    const expected = [{ path: '/v/p/attachments/c/ab.txt' }];
    expect(turnFiles([PASTE], '/v', mention)).toEqual(expected);
    expect(turnFiles([PASTE], '/v')).toEqual(expected);
  });

  it('carries a file the agent cannot mention', () => {
    expect(turnFiles([{ kind: 'file', path: '/v/say "hi".md', name: 'say "hi".md' }], '/v', mention)).toEqual([{ path: '/v/say "hi".md' }]);
  });
});

describe('attachment helpers', () => {
  it('joins a stored path to the root and leaves a file path alone', () => {
    expect(attachmentFilePath(IMAGE, '/v')).toBe('/v/p/attachments/c/a.png');
    expect(attachmentFilePath(FILE, '/v')).toBe('/v/notes/Week 1.md');
  });

  it('calls an image and a paste stored, and a file not', () => {
    expect([IMAGE, PASTE, FILE].map(isStored)).toEqual([true, true, false]);
  });

  it('maps each picked file token to its path, and skips an unpicked file', () => {
    expect(mentionPaths([FILE, MENTION, IMAGE])).toEqual(new Map([['b.md', '/v/b.md']]));
  });
});

describe('isImageMediaType', () => {
  it('accepts the four types the agents take and nothing else', () => {
    expect(['image/png', 'image/jpeg', 'image/gif', 'image/webp'].every(isImageMediaType)).toBe(true);
    expect(['image/bmp', 'image/svg+xml', 'toString', 4, undefined].some(isImageMediaType)).toBe(false);
  });
});

describe('mediaTypeOfExtension', () => {
  it('names the image types by extension, in any case, and nothing else', () => {
    expect(['png', 'JPG', 'jpeg', 'gif', 'webp'].map(mediaTypeOfExtension)).toEqual(['image/png', 'image/jpeg', 'image/jpeg', 'image/gif', 'image/webp']);
    expect(['pdf', 'md', '', 'svg'].map(mediaTypeOfExtension)).toEqual([null, null, null, null]);
  });
});

describe('turnImages', () => {
  it('gives the agent each image by its path under the root, and no file', () => {
    const attachments = [
      { kind: 'file' as const, path: '/Users/me/week1.pdf', name: 'week1.pdf' },
      { kind: 'image' as const, path: 'p/attachments/c/a.png', mediaType: 'image/png' as const, name: 'shot.png' },
    ];
    expect(turnImages(attachments, '/vault')).toEqual([
      { path: '/vault/p/attachments/c/a.png', mediaType: 'image/png' },
    ]);
  });
});

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const whole = (text: string) => fileText(bytes(text), bytes(text).length);

describe('fileText', () => {
  it('returns a small file whole, with its line count', () => {
    expect(whole('{\n  "id": "clew"\n}\n')).toEqual({ text: '{\n  "id": "clew"\n}', lines: 3, truncated: false });
  });

  it('counts a last line that has no line break', () => {
    expect(whole('a\nb')).toEqual({ text: 'a\nb', lines: 2, truncated: false });
  });

  it('keeps the first lines of a file with more than the line limit', () => {
    const text = Array.from({ length: INLINE_MAX_LINES + 5 }, (_, i) => `line ${i + 1}`).join('\n');
    const result = whole(text)!;
    expect(result.lines).toBe(INLINE_MAX_LINES);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith(`line ${INLINE_MAX_LINES}`)).toBe(true);
  });

  it('drops the line the byte limit cut, and marks the file cut', () => {
    const head = bytes('one\ntwo\nthr');
    expect(fileText(head, head.length + 500)).toEqual({ text: 'one\ntwo', lines: 2, truncated: true });
  });

  it('keeps a single line longer than the byte limit, cut', () => {
    const head = bytes('x'.repeat(INLINE_MAX_BYTES));
    expect(fileText(head, head.length * 3)).toEqual({ text: 'x'.repeat(INLINE_MAX_BYTES), lines: 1, truncated: true });
  });

  it('does not fail on a multi-byte character the byte limit cut in half', () => {
    const full = bytes('é\né');
    const head = full.subarray(0, full.length - 1);
    expect(fileText(head, full.length)).toEqual({ text: 'é', lines: 1, truncated: true });
  });

  it('refuses a binary file', () => {
    expect(fileText(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]), 6)).toBeNull();
  });

  it('refuses bytes that are not UTF-8', () => {
    expect(fileText(new Uint8Array([0xff, 0xfe, 0x41]), 3)).toBeNull();
  });

  it('refuses an empty or blank file', () => {
    expect(whole('')).toBeNull();
    expect(whole('\n\n')).toBeNull();
  });
});

describe('readTexts', () => {
  let dir: string;
  const file = (name: string, content: string | Uint8Array): string => {
    writeFileSync(join(dir, name), content);
    return join(dir, name);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'clew-attached-'));
  });
  afterEach(() => rmSync(dir, { recursive: true }));

  it('reads a small text file whole', async () => {
    const small = file('a.json', '{\n}\n');
    expect((await readTexts([small])).get(small)).toEqual({ text: '{\n}', lines: 2, truncated: false });
  });

  it('reads only the start of a file over the byte limit', async () => {
    const big = file('big.txt', `${'x'.repeat(100)}\n`.repeat(2000));
    const text = (await readTexts([big])).get(big)!;
    expect(text.truncated).toBe(true);
    expect(Buffer.byteLength(text.text)).toBeLessThanOrEqual(INLINE_MAX_BYTES);
  });

  it('leaves out a binary file, a folder, and a missing file', async () => {
    const pdf = file('a.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00]));
    mkdirSync(join(dir, 'sub'));
    expect((await readTexts([pdf, join(dir, 'sub'), join(dir, 'gone.md')])).size).toBe(0);
  });
});
