import { parseEnv, UserEnv } from '@/settings/UserEnv';

describe('parseEnv', () => {
  it('reads one NAME=value per line', () => {
    expect(parseEnv('ANTHROPIC_API_KEY=sk-ant-1\nHTTPS_PROXY=http://localhost:8080').env).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant-1',
      HTTPS_PROXY: 'http://localhost:8080',
    });
  });

  it('splits at the first = only, so a value may hold =', () => {
    expect(parseEnv('TOKEN=a=b==').env).toEqual({ TOKEN: 'a=b==' });
  });

  it('trims around the name and the value, and reads CRLF lines', () => {
    expect(parseEnv('  A = 1  \r\nB=2\r\n').env).toEqual({ A: '1', B: '2' });
  });

  it('skips blank lines and # comments', () => {
    expect(parseEnv('\n# a note\nA=1\n   \n').env).toEqual({ A: '1' });
  });

  it('strips matching quotes and keeps a lone one', () => {
    expect(parseEnv('A="x y"\nB=\'z\'\nC="half\nD=\'mixed"').env).toEqual({ A: 'x y', B: 'z', C: '"half', D: '\'mixed"' });
  });

  it('keeps an empty value', () => {
    expect(parseEnv('A=').env).toEqual({ A: '' });
  });

  it('lets a later line replace an earlier one with the same name', () => {
    expect(parseEnv('A=1\nA=2').env).toEqual({ A: '2' });
  });

  it('reports the lines that are not NAME=value and keeps the rest', () => {
    const { env, invalid } = parseEnv('A=1\nno equals\n=novalue\n1BAD=x\nA-B=y\nB=2');
    expect(invalid).toEqual([2, 3, 4, 5]);
    expect(env).toEqual({ A: '1', B: '2' });
  });
});

describe('UserEnv', () => {
  function userEnv(stored: string | null) {
    const state = { stored };
    const onChange = jest.fn();
    return { state, onChange, env: new UserEnv(() => state.stored, (text) => { state.stored = text; }, onChange) };
  }

  it('starts empty when no secret is stored', () => {
    const { env } = userEnv(null);
    expect(env.text).toBe('');
    expect(env.resolve()).toEqual({});
  });

  it('writes the text as typed and resolves from what is stored now', () => {
    const { env, state } = userEnv('A=1');
    expect(env.resolve()).toEqual({ A: '1' });
    env.set('A=2\n# note');
    expect(state.stored).toBe('A=2\n# note');
    expect(env.text).toBe('A=2\n# note');
    expect(env.resolve()).toEqual({ A: '2' });
  });

  it('reports a change when a variable is added, changed or removed', () => {
    const { env, onChange } = userEnv('A=1');
    env.set('A=1\nB=2');
    env.set('A=3\nB=2');
    env.set('A=3');
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('reports no change for an edit that leaves the variables as they were', () => {
    const { env, state, onChange } = userEnv('A=1\nB=2');
    env.set('# why\nB=2\n\nA = 1\nnot valid');
    expect(state.stored).toBe('# why\nB=2\n\nA = 1\nnot valid');
    expect(onChange).not.toHaveBeenCalled();
  });
});
