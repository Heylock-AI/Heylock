/* eslint-disable no-undef */
// Defensive and cross-env tests for Heylock

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

describe('Heylock (defensive/cross-env)', () => {
  let Heylock;
  let fetchMock;
  let agent;

  // Helper to initialize Heylock agent for tests
  async function initHappy(options = {}) {
    if (!Heylock) Heylock = await getHeylock();
    agent = new Heylock('test-key', options);
    await new Promise((r) => agent.onInitialized(r));
    return agent;
  }

  beforeEach(async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    Heylock = await getHeylock();
    agent = undefined;
  });

  afterEach(() => {
    delete global.fetch;
    agent = undefined;
  });


  test('mutation attempts on returned arrays/objects throw and do not affect internal state', async () => {
    const agent = await initHappy();
    agent.addMessage('hi', 'user');
    agent.addContextEntry('ctx');
    const hist = agent.messageHistory;
    const ctx = agent.context;
    expect(() => hist.push(1)).toThrow();
    expect(() => ctx.push(1)).toThrow();
    expect(() => { hist[0].content = 'bad'; }).not.toThrow();
    expect(agent.messageHistory[0].content).toBe('hi');
    expect(agent.context[0].content).toBe('ctx');
  });

  test('concurrent callbacks: all fire in order', async () => {
    const agent = await initHappy();
    const calls = [];
    agent.onMessageHistoryChange(() => calls.push('a'));
    agent.onMessageHistoryChange(() => calls.push('b'));
    agent.addMessage('one');
    expect(calls).toEqual(['a', 'b']);
  });

  test('callback errors do not prevent others from firing', async () => {
    const agent = await initHappy();
    const calls = [];
    agent.onMessageHistoryChange(() => { throw new Error('fail'); });
    agent.onMessageHistoryChange(() => calls.push('ok'));
    agent.addMessage('one');
    expect(calls).toEqual(['ok']);
  });

  test('context string edge case: future timestamp', async () => {
    const agent = await initHappy();
    agent.addContextEntry('future', Date.now() + 100000);
    const s = agent.getContextString();
    expect(s).toMatch(/in the future/);
  });
});
