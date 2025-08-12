/** @jest-environment jsdom */
/* eslint-disable no-undef */

// Tests focused on browser storage behavior using jsdom

function makeHeaders(headers = {}) {
  const map = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])
  );
  return {
    get(name) {
      const val = map.get(String(name).toLowerCase());
      return val == null ? null : val;
    },
  };
}

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: makeHeaders(headers),
    async json() {
      return body;
    },
  };
}

async function getHeylock() {
  const mod = await import('../index.js');
  return mod.default;
}

describe('Heylock (browser storage)', () => {
  let Heylock;
  let fetchMock;
  let warnSpy;

  beforeEach(async () => {
    // jsdom provides window, document, and localStorage
    localStorage.clear();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    Heylock = await getHeylock();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete global.fetch;
    localStorage.clear();
  });

  async function initHappy({ usage = { messages: 5, sorts: 4, rewrites: 3 }, opts = {} } = {}) {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { valid: true }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          limits: {
            messages: { remaining: usage.messages },
            sorts: { remaining: usage.sorts },
            rewrites: { remaining: usage.rewrites },
          },
        })
      );

    const agent = new Heylock('KEY', { suppressWarnings: true, ...opts });
    const initialized = await new Promise((r) => agent.onInitialized(r));
    expect(initialized).toBe(true);
    return agent;
  }

  test('defaults useStorage to true in browser environment', async () => {
    const agent = await initHappy({ opts: { agentId: 'A1' } });
    expect(agent.useStorage).toBe(true);
  });

  test('persists context to localStorage on change (namespaced key)', async () => {
    const agent = await initHappy({ opts: { agentId: 'A2' } });
    agent.addContextEntry('hello world', 0);
    const key = 'heylock:A2:context';
    const raw = localStorage.getItem(key);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].content).toBe('hello world');
  });

  test('restores valid context from localStorage on construction', async () => {
    const key = 'heylock:A3:context';
    localStorage.setItem(
      key,
      JSON.stringify([
        { content: 'one', timestamp: 1 },
        { content: 'two', timestamp: 2 },
      ])
    );

    // init sequence
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { valid: true }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          limits: {
            messages: { remaining: 1 },
            sorts: { remaining: 1 },
            rewrites: { remaining: 1 },
          },
        })
      );

    const agent = new Heylock('KEY', { agentId: 'A3', useStorage: true, suppressWarnings: true });
    // Context is restored synchronously during construction
    expect(agent.context.length).toBe(2);
    await new Promise((r) => agent.onInitialized(r));
  });

  test('invalid JSON in storage warns and does not restore', async () => {
    const key = 'heylock:A4:context';
    localStorage.setItem(key, 'not json');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { valid: true }))
      .mockResolvedValueOnce(jsonResponse(200, { limits: { messages: { remaining: 1 }, sorts: { remaining: 1 }, rewrites: { remaining: 1 } } }));

    const agent = new Heylock('KEY', { agentId: 'A4', useStorage: true, suppressWarnings: false });
    expect(agent.context.length).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Failed to parse stored context/));
    await new Promise((r) => agent.onInitialized(r));
  });

  test('invalid stored context structure warns and does not restore', async () => {
    const key = 'heylock:A5:context';
    localStorage.setItem(key, JSON.stringify([{ content: 123 }, 'bad']));

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { valid: true }))
      .mockResolvedValueOnce(jsonResponse(200, { limits: { messages: { remaining: 1 }, sorts: { remaining: 1 }, rewrites: { remaining: 1 } } }));

    const agent = new Heylock('KEY', { agentId: 'A5', useStorage: true, suppressWarnings: false });
    expect(agent.context.length).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Stored context is invalid/));
    await new Promise((r) => agent.onInitialized(r));
  });

  test('no warnings on save in browser when useStorage is true', async () => {
    const agent = await initHappy({ opts: { agentId: 'A6', useStorage: true, suppressWarnings: false } });
    warnSpy.mockClear();
    agent.addContextEntry('persist me');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
