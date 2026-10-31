import { check, compare, contrast, heightJumps, snapshot } from './checks';
import type { StateGeometry, TextBox } from './geometry';

const text = (over: Partial<TextBox>): TextBox => ({
  kind: 'text', text: 'a', x: 0, y: 0, w: 40, h: 16, fg: 'rgb(0, 0, 0)', bg: 'rgb(255, 255, 255)', px: 14, ...over,
});
const state = (texts: TextBox[], over: Partial<StateGeometry> = {}): StateGeometry => ({
  state: 'step:0', width: 320, rect: { x: 0, y: 0, w: 320, h: 200 }, texts, badAttributes: [], pageScrollsSideways: false, ...over,
});
const checks = (s: StateGeometry) => check(s).map(({ check }) => check);

test('a clean state has no findings', () => {
  expect(check(state([text({ text: 'a' }), text({ text: 'b', x: 50 })]))).toEqual([]);
});

test('overlapping labels are found, touching ones are not', () => {
  expect(checks(state([text({}), text({ x: 30 })]))).toEqual(['overlap']);
  expect(checks(state([text({}), text({ x: 39 })]))).toEqual([]);
});

test('text cut off by its container is clipped; past a scroller it is not', () => {
  const clip = { x: 0, y: 0, w: 100, h: 50 };
  expect(checks(state([text({ x: 80, clip })]))).toEqual(['clipped']);
  expect(checks(state([text({ x: 80, clip, scrolls: true })]))).toEqual([]);
});

test('text past the visual edge with no clipping container overflows', () => {
  expect(checks(state([text({ x: 300 })]))).toEqual(['overflow']);
});

test('tiny text, low contrast, bad numbers and errors are found', () => {
  expect(checks(state([text({ h: 7, px: 7 })]))).toEqual(['tiny-text']);
  expect(checks(state([text({ fg: 'rgb(200, 200, 200)' })]))).toEqual(['low-contrast']);
  expect(checks(state([], { badAttributes: ['<path d="MNaN,0">'], error: 'boom' }))).toEqual(['error', 'bad-number']);
});

test('contrast blends a translucent colour and reads color(srgb)', () => {
  expect(contrast('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(21);
  expect(contrast('rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)')).toBeCloseTo(1);
  expect(contrast('color(srgb 1 1 1)', 'rgb(0, 0, 0)')).toBeCloseTo(21);
  expect(contrast('oklch(0.5 0 0)', 'rgb(0, 0, 0)')).toBeUndefined();
});

test('a height change between steps is a jump', () => {
  const at = (h: number, s: string) => state([], { state: s, rect: { x: 0, y: 0, w: 320, h } });
  expect(heightJumps([at(200, 'step:0'), at(201, 'step:1')])).toEqual([]);
  expect(heightJumps([at(200, 'step:0'), at(240, 'step:1')]).map(({ check }) => check)).toEqual(['height-jump']);
});

test('goldens ignore jitter and report moves, new and gone texts', () => {
  const before = snapshot(state([text({ text: 'a' }), text({ text: 'b', x: 50 })]));
  expect(compare(before, snapshot(state([text({ text: 'a', x: 1 }), text({ text: 'b', x: 50 })])))).toEqual([]);
  expect(compare(before, snapshot(state([text({ text: 'a', x: 10 }), text({ text: 'c', x: 50 })])))).toEqual(['moved "a" by 10 px', 'new "c"', 'gone "b"']);
});
