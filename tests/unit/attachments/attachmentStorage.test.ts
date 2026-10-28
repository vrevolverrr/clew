import { imagePath, MAX_IMAGE_BYTES, MAX_IMAGE_EDGE, pasteName, pastePath, storagePlan } from '@/attachments/attachmentStorage';

describe('storagePlan', () => {
  it('keeps an image that fits as it is', () => {
    expect(storagePlan(1200, 800, 300_000, 'image/png')).toBeNull();
    expect(storagePlan(MAX_IMAGE_EDGE, 100, MAX_IMAGE_BYTES, 'image/jpeg')).toBeNull();
  });

  it('shrinks the long edge to the limit and keeps the proportions', () => {
    expect(storagePlan(5152, 2576, 1_000_000, 'image/png')).toEqual({ width: MAX_IMAGE_EDGE, height: 1288, mediaType: 'image/png' });
    expect(storagePlan(1000, 4000, 1_000_000, 'image/webp')).toEqual({ width: 644, height: MAX_IMAGE_EDGE, mediaType: 'image/png' });
  });

  it('stores a JPEG as a JPEG', () => {
    expect(storagePlan(6000, 4000, 1_000_000, 'image/jpeg')).toMatchObject({ mediaType: 'image/jpeg' });
  });

  it('keeps the size of an image that is too big only in bytes, and makes it a JPEG', () => {
    expect(storagePlan(2000, 1500, MAX_IMAGE_BYTES + 1, 'image/png')).toEqual({ width: 2000, height: 1500, mediaType: 'image/jpeg' });
  });

  it('never makes a side smaller than one pixel', () => {
    expect(storagePlan(100_000, 10, 1000, 'image/png')).toMatchObject({ width: MAX_IMAGE_EDGE, height: 1 });
  });
});

describe('imagePath', () => {
  it('names the file by content inside the chat folder', () => {
    expect(imagePath('plugin/attachments', 'chat-1', 'abc', 'image/jpeg')).toBe('plugin/attachments/chat-1/abc.jpg');
  });
});

describe('pasteName', () => {
  it('counts the lines of the paste', () => {
    expect(pasteName('a\nb\nc\n')).toBe('Pasted text · 3 lines');
  });

  it('says line for a single line', () => {
    expect(pasteName('x'.repeat(3000))).toBe('Pasted text · 1 line');
  });
});

describe('pastePath', () => {
  it('keeps a paste in the chat folder beside its images, named by its content', () => {
    expect(pastePath('p/attachments', 'chat-1', 'ab12')).toBe('p/attachments/chat-1/ab12.txt');
  });
});
