/* eslint-disable no-undef */
// Comprehensive tests for Heylock main script

const TextEncoder = global.TextEncoder || require('util').TextEncoder;
const encoder = new TextEncoder();

// Helpers to create mock fetch responses
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

function streamResponse(status, chunks, headers = {}) {
	// chunks: array of strings to emit in sequence via reader.read()
	let i = 0;
	return {
		status,
		headers: makeHeaders(headers),
		body: {
			getReader() {
				return {
					async read() {
						if (i >= chunks.length) return { done: true, value: undefined };
						const value = encoder.encode(chunks[i++]);
						return { done: false, value };
					},
				};
			},
		},
	};
}

async function getHeylock() {
	const mod = await import('../index.js');
	return mod.default;
}

describe('Heylock', () => {
	let Heylock;
	let fetchMock;
	let warnSpy;

	beforeEach(async () => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
		warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

		fetchMock = jest.fn();
		global.fetch = fetchMock;

		Heylock = await getHeylock();
	});

	afterEach(() => {
		jest.useRealTimers();
		warnSpy.mockRestore();
		delete global.fetch;
	});

	async function initHappyPath({ usage = { messages: 10, sorts: 5, rewrites: 7 } } = {}) {
		// 1) verifyKey, 2) fetchUsageRemaining
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

		const agent = new Heylock('KEY', { suppressWarnings: true });

		const initialized = await new Promise((resolve) => {
			agent.onInitialized((success) => resolve(success));
		});

		expect(initialized).toBe(true);
		return agent;
	}

	test('constructor validates agentKey and defaults', async () => {
		await expect(async () => new Heylock('')).rejects.toThrow(/agentKey must be a non-empty string/);

		fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: true }));
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, {
				limits: { messages: { remaining: 1 }, sorts: { remaining: 1 }, rewrites: { remaining: 1 } },
			})
		);

		const agent = new Heylock('KEY');
		const ok = await new Promise((r) => agent.onInitialized(r));
		expect(ok).toBe(true);
		expect(agent.useStorage).toBe(false); // defaults to false in Node
	});

	test('onInitialized unsubscribe removes the right callback', async () => {
		const agentP = (async () => {
			fetchMock
				.mockResolvedValueOnce(jsonResponse(200, { valid: true }))
				.mockResolvedValueOnce(
					jsonResponse(200, {
						limits: { messages: { remaining: 1 }, sorts: { remaining: 1 }, rewrites: { remaining: 1 } },
					})
				);
			const a = new Heylock('KEY');
			return a;
		})();

		const agent = await agentP;
		const calls = [];
		const unsub1 = agent.onInitialized((s) => calls.push(['a', s]));
		const unsub2 = agent.onInitialized((s) => calls.push(['b', s]));
		unsub1();

		const ok = await new Promise((r) => agent.onInitialized(r));
		expect(ok).toBe(true);

		// only 'b' and the last anonymous callback should fire
		expect(calls.some(([id]) => id === 'a')).toBe(false);
		expect(calls.some(([id]) => id === 'b')).toBe(true);
	});

	test('usageRemaining is readonly (defensive copy)', async () => {
		const agent = await initHappyPath({ usage: { messages: 9, sorts: 2, rewrites: 3 } });
		const usage = agent.usageRemaining;
		expect(usage.messages).toBe(9);
		expect(() => { usage.messages = 0; }).toThrow();
		// internal remains unchanged
		expect(agent.usageRemaining.messages).toBe(9);
	});

	test('messageHistory and context are readonly views', async () => {
		const agent = await initHappyPath();
		agent.addMessage('hi', 'user');
		agent.addContextEntry('opened page');

		const hist = agent.messageHistory;
		const ctx = agent.context;
		expect(() => hist.push(1)).toThrow();
		expect(() => ctx.push(1)).toThrow();

		// mutation attempts do not affect internal state
		expect(agent.messageHistory.length).toBe(1);
		expect(agent.context.length).toBe(1);
	});

	test('message validation and success flow', async () => {
		const agent = await initHappyPath({ usage: { messages: 10, sorts: 5, rewrites: 7 } });

		// message call response
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { message: 'Hello back' }, { 'x-ratelimit-remaining': 8 })
		);

		const reply = await agent.message('Hello', false, true);
		expect(reply).toBe('Hello back');
		expect(agent.messageHistory.length).toBe(2); // user + assistant
		expect(agent.usageRemaining.messages).toBe(8);

		// invalid inputs
		await expect(agent.message('', true, true)).rejects.toThrow(/content must be a non-empty string/);
	});

	test('message omits falsey history/context in payload', async () => {
		const agent = await initHappyPath();
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: 'ok' }, {}));

		await agent.message('Ping', false, false);

		const lastCall = fetchMock.mock.calls.at(-1);
		const body = JSON.parse(lastCall[1].body);
		expect('history' in body).toBe(false);
		expect('context' in body).toBe(false);
	});

	test('messageStream yields chunks and updates history when enabled', async () => {
		const agent = await initHappyPath();

		const lines = [
			JSON.stringify({ message: 'He', done: false }) + '\n',
			JSON.stringify({ message: 'llo', done: false }) + '\n',
			JSON.stringify({ done: true }) + '\n',
		];
		fetchMock.mockResolvedValueOnce(
			streamResponse(200, lines, { 'x-ratelimit-remaining': 7 })
		);

		const chunks = [];
		let full;
		for await (const c of agent.messageStream('Hello', true, true)) {
			chunks.push(c);
		}
		// async generator return value is not captured by for-await; we can infer from history
		expect(chunks.join('')).toBe('Hello');
		expect(agent.messageHistory.at(-1).content).toBe('Hello');
		expect(agent.usageRemaining.messages).toBe(7);
	});

	test('messageStream does not modify history when disabled', async () => {
		const agent = await initHappyPath();
		const lines = [JSON.stringify({ message: 'A', done: false }) + '\n', JSON.stringify({ done: true }) + '\n'];
		fetchMock.mockResolvedValueOnce(streamResponse(200, lines, {}));

		const chunks = [];
		for await (const c of agent.messageStream('Hello', true, false)) { chunks.push(c); }
		// Only user not added; and assistant placeholder was not created
		expect(agent.messageHistory.length).toBe(0);
	});

	test('greet honors useContext and saveToMessageHistory', async () => {
		const agent = await initHappyPath();
		agent.addContextEntry('loves jazz', Date.now());

		// greet internally calls message -> reply ok
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: 'Hi!' }, {}));

		const out = await agent.greet(undefined, true, false);
		expect(out).toBe('Hi!');
		expect(agent.messageHistory.length).toBe(0); // saveToMessageHistory = false

		// check body contains context string and greeting intent
		const call = fetchMock.mock.calls.at(-1);
		const body = JSON.parse(call[1].body);
		expect(body.content).toMatch(/Greet the visitor/i);
		expect(body.context).toMatch(/loves jazz/);
	});

	test('shouldEngage throttles subsequent calls', async () => {
		const agent = await initHappyPath();
		// first call success
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { shouldEngage: true, reasoning: 'go', fallback: false })
		);

		const first = await agent.shouldEngage('test');
		expect(first.shouldEngage).toBe(true);

		// second call within throttle window
		const second = await agent.shouldEngage('test');
		expect(second.fallback).toBe(true);
		expect(second.warning).toMatch(/Throttling/);
	});

	test('rewrite updates usage and returns text', async () => {
		const agent = await initHappyPath({ usage: { messages: 10, sorts: 5, rewrites: 3 } });
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { text: 'Fixed.' }, { 'x-ratelimit-remaining': 2 })
		);

		const out = await agent.rewrite('plz fix');
		expect(out).toBe('Fixed.');
		expect(agent.usageRemaining.rewrites).toBe(2);
	});

	test('sort returns fallback on short array', async () => {
		const agent = await initHappyPath();
		const res = await agent.sort([1]);
		expect(res.fallback).toBe(true);
		expect(res.array).toEqual([1]);
		expect(res.indexes).toEqual([0]);
	});

	test('sort returns sorted array and indexes', async () => {
		const agent = await initHappyPath({ usage: { messages: 10, sorts: 5, rewrites: 7 } });
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { indexes: [2, 0, 1], reasoning: 'ok' }, { 'x-ratelimit-remaining': 4 })
		);

		const input = ['a', 'b', 'c'];
		const res = await agent.sort(input, 'desc');
		expect(res.indexes).toEqual([2, 0, 1]);
		expect(res.array).toEqual(['c', 'a', 'b']);
		expect(agent.usageRemaining.sorts).toBe(4);
	});

	test('messageHistory and context change callbacks fire and can unsubscribe', async () => {
		const agent = await initHappyPath();

		const mh = [];
		const ch = [];
		const um = agent.onMessageHistoryChange((h) => mh.push(h.length));
		const uc = agent.onContextChange((c) => ch.push(c.length));

		agent.addMessage('hello');
		agent.addMessage('there');
		um();
		agent.addMessage('friend');

		agent.addContextEntry('one');
		uc();
		agent.addContextEntry('two');

		expect(mh).toEqual([1, 2]);
		expect(ch).toEqual([1]);
	});

		test('initialization handles invalid/failed verification and notifies with false', async () => {
			// 500 on verify
			fetchMock.mockResolvedValueOnce({ status: 500 });
			const agent1 = new Heylock('KEY', { suppressWarnings: false });
			const res1 = await new Promise((r) => agent1.onInitialized(r));
			expect(res1).toBe(false);
			expect(warnSpy).toHaveBeenCalled();

			// 200 but invalid payload
			warnSpy.mockClear();
			fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: 'nope' }));
			const agent2 = new Heylock('KEY', { suppressWarnings: false });
			const res2 = await new Promise((r) => agent2.onInitialized(r));
			expect(res2).toBe(false);
			expect(warnSpy).toHaveBeenCalled();

			// 200 valid false
			warnSpy.mockClear();
			fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: false }));
			const agent3 = new Heylock('KEY', { suppressWarnings: false });
			const res3 = await new Promise((r) => agent3.onInitialized(r));
			expect(res3).toBe(false);
		});

		test('fetchUsageRemaining throws on 401/500/503 and non-200', async () => {
			const agent = await initHappyPath();

			fetchMock.mockResolvedValueOnce({ status: 401 });
			await expect(agent.fetchUsageRemaining()).rejects.toThrow(/authorization failed/);

			fetchMock.mockResolvedValueOnce({ status: 500 });
			await expect(agent.fetchUsageRemaining()).rejects.toThrow(/server issues/);

			fetchMock.mockResolvedValueOnce({ status: 503 });
			await expect(agent.fetchUsageRemaining()).rejects.toThrow(/server is busy/);

			fetchMock.mockResolvedValueOnce({ status: 418 });
			await expect(agent.fetchUsageRemaining()).rejects.toThrow(/something went wrong/);
		});

		test('add/modify/remove message validations', async () => {
			const agent = await initHappyPath();
			await expect(() => agent.addMessage(123)).toThrow(/content must be a string/);
			await expect(() => agent.addMessage('x', 'bad')).toThrow(/role must be either/);

			agent.addMessage('ok');
			await expect(() => agent.modifyMessage(2, 'x')).toThrow(/out of bounds/);
			await expect(() => agent.modifyMessage(0, '', 'assistant')).toThrow(/non-empty string/);
			await expect(() => agent.modifyMessage(0, 'y', 'bad')).toThrow(/role must be either/);

			await expect(() => agent.removeMessage(5)).toThrow(/out of bounds/);
		});

		test('context validations and formatting', async () => {
			const agent = await initHappyPath();
			await expect(() => agent.addContextEntry('')).toThrow(/non-empty string/);
			await expect(() => agent.addContextEntry('a', -1)).toThrow(/finite, non-negative/);

			const now = Date.now();
			agent.addContextEntry('now', now);
			agent.addContextEntry('a minute', now - 61_000);
			const s = agent.getContextString();
			expect(s).toMatch(/now\./);
			expect(s).toMatch(/1 minute/);
		});

		test('storage warns in Node when useStorage is true', async () => {
			// init must respond to verify
			fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: true }));
			fetchMock.mockResolvedValueOnce(
				jsonResponse(200, { limits: { messages: { remaining: 1 }, sorts: { remaining: 1 }, rewrites: { remaining: 1 } } })
			);
			const agent = new Heylock('KEY', { useStorage: true, suppressWarnings: false });
			await new Promise((r) => agent.onInitialized(r));
			warnSpy.mockClear();

			agent.addContextEntry('will trigger save');
			expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/browser environment/));
		});

		test('message error HTTP responses', async () => {
			const agent = await initHappyPath();
			fetchMock.mockResolvedValueOnce({ status: 400, headers: makeHeaders({}) });
			await expect(agent.message('x')).rejects.toThrow(/please check arguments/);

			fetchMock.mockResolvedValueOnce({ status: 401, headers: makeHeaders({}) });
			await expect(agent.message('x')).rejects.toThrow(/authorization failed/);

			fetchMock.mockResolvedValueOnce({ status: 429, headers: makeHeaders({ 'x-ratelimit-remaining': 0 }) });
			await expect(agent.message('x')).rejects.toThrow(/reached your message plan limit/);

			fetchMock.mockResolvedValueOnce({ status: 429, headers: makeHeaders({}) });
			await expect(agent.message('x')).rejects.toThrow(/too many requests/);

			fetchMock.mockResolvedValueOnce({ status: 500, headers: makeHeaders({}) });
			await expect(agent.message('x')).rejects.toThrow(/server issues/);
		});

		test('messageStream error does not modify history when disabled', async () => {
			const agent = await initHappyPath();
			fetchMock.mockResolvedValueOnce({ status: 500, headers: makeHeaders({}) });
			const gen = agent.messageStream('hello', true, false);
			await expect(gen.next()).rejects.toThrow(/messageStream failed/);
			expect(agent.messageHistory.length).toBe(0);
		});

		test('greet validation on empty string', async () => {
			const agent = await initHappyPath();
			await expect(agent.greet('')).rejects.toThrow(/instructions must be a non-empty string/);
		});

		test('shouldEngage error HTTP responses', async () => {
			const agent = await initHappyPath();

			// Advance beyond throttle
			jest.advanceTimersByTime(16000);
			fetchMock.mockResolvedValueOnce({ status: 400 });
			await expect(agent.shouldEngage('x')).rejects.toThrow(/invalid arguments/);

			jest.advanceTimersByTime(16000);
			fetchMock.mockResolvedValueOnce({ status: 401 });
			await expect(agent.shouldEngage('x')).rejects.toThrow(/authorization failed/);

			jest.advanceTimersByTime(16000);
			fetchMock.mockResolvedValueOnce({ status: 500 });
			await expect(agent.shouldEngage('x')).rejects.toThrow(/server issues/);

			jest.advanceTimersByTime(16000);
			fetchMock.mockResolvedValueOnce({ status: 502 });
			await expect(agent.shouldEngage('x')).rejects.toThrow(/external service/);

			jest.advanceTimersByTime(16000);
			fetchMock.mockResolvedValueOnce({ status: 418 });
			await expect(agent.shouldEngage('x')).rejects.toThrow(/unexpected error/);
		});

		test('rewrite 429 differentiates plan limit vs too many requests', async () => {
			const agent = await initHappyPath();
			fetchMock.mockResolvedValueOnce({ status: 429, headers: makeHeaders({ 'x-ratelimit-remaining': 0 }) });
			await expect(agent.rewrite('x')).rejects.toThrow(/reached your rewrite plan limit/);

			fetchMock.mockResolvedValueOnce({ status: 429, headers: makeHeaders({}) });
			await expect(agent.rewrite('x')).rejects.toThrow(/too many requests/);
		});

		test('sort error HTTP responses', async () => {
			const agent = await initHappyPath();
			fetchMock.mockResolvedValueOnce({ status: 400 });
			await expect(agent.sort([1,2])).rejects.toThrow(/invalid arguments/);

			fetchMock.mockResolvedValueOnce({ status: 429, headers: makeHeaders({ 'x-ratelimit-remaining': 0 }) });
			await expect(agent.sort([1,2])).rejects.toThrow(/reached your sort plan limit/);

			fetchMock.mockResolvedValueOnce({ status: 429, headers: makeHeaders({}) });
			await expect(agent.sort([1,2])).rejects.toThrow(/too many requests/);
		});

		test('disabling useMessageHistory omits history in payloads', async () => {
			// init
			fetchMock
				.mockResolvedValueOnce(jsonResponse(200, { valid: true }))
				.mockResolvedValueOnce(
					jsonResponse(200, {
						limits: {
							messages: { remaining: 10 },
							sorts: { remaining: 10 },
							rewrites: { remaining: 10 },
						},
					})
				);
			const agent = new Heylock('KEY', { useMessageHistory: false, suppressWarnings: true });
			await new Promise((r) => agent.onInitialized(r));

			// message with non-empty internal history should still omit history if disabled
			agent.addMessage('user');
			fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: 'ok' }));
			await agent.message('ping');
			const call1 = fetchMock.mock.calls.at(-1);
			const body1 = JSON.parse(call1[1].body);
			expect('history' in body1).toBe(false);

			// stream also omits history
			const lines = [JSON.stringify({ message: 'x', done: false }) + '\n', JSON.stringify({ done: true }) + '\n'];
			fetchMock.mockResolvedValueOnce(streamResponse(200, lines, {}));
			for await (const _ of agent.messageStream('hi')) {}
			const call2 = fetchMock.mock.calls.at(-1);
			const body2 = JSON.parse(call2[1].body);
			expect('history' in body2).toBe(false);
		});
});
