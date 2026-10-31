import { runFigure } from './runProgram';

/** A program that escapes `node:vm` to the child's `process` and shows what `body` finds there. */
const escaped = (body: string): string => `const process = this.constructor.constructor('return process')();
export default () => <Text text={String((() => { try { return ${body}; } catch (error) { return error.code; } })())} />;`;
const shown = async (source: string): Promise<unknown> => {
  const result = await runFigure(source);
  return 'figure' in result ? (result.figure.steps[0].root as { text?: string }).text : result.error;
};

describe('runFigure', () => {
  it('draws a program, and one that escapes the vm finds no environment and cannot read files or start processes', async () => {
    expect(await shown('export default () => <Text text="hi" />;')).toBe('hi');
    expect(await shown(escaped('Object.keys(process.env).filter((key) => key !== "__CF_USER_TEXT_ENCODING").length'))).toBe('0');
    expect(await shown(escaped('process.getBuiltinModule("fs").readFileSync("package.json", "utf8")'))).toBe('ERR_ACCESS_DENIED');
    expect(await shown(escaped('process.getBuiltinModule("child_process").execSync("true")'))).toBe('ERR_ACCESS_DENIED');
  });
});
