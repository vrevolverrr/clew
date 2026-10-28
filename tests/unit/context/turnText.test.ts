import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { turnText } from '@/context/turnText';

it('names mentioned files, carries the start of the rest, and leaves images out of the text', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'clew-turn-'));
  try {
    writeFileSync(path.join(root, 'paste.txt'), 'pasted line');
    const text = await turnText({
      message: 'Explain', note: { path: 'week1.md' },
      attachments: [
        { kind: 'file', path: '/abs/handout.pdf', name: 'handout.pdf' },
        { kind: 'paste', path: 'paste.txt', name: 'paste.txt' },
        { kind: 'image', path: 'a.png', mediaType: 'image/png', name: 'a.png' },
      ],
    }, { skillSyntax: { prefix: '/', atStart: true }, fileMention: (file) => `@"${file}"`, root });
    expect(text).toBe(`<note path="week1.md"/>\n\n@"/abs/handout.pdf"\n\n<attachment path="${root}/paste.txt" lines="1-1">\npasted line\n</attachment>\n\nExplain`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
