// This file should be named index.types-check.ts so Jest ignores it.
// Run type checks with: npx tsc --noEmit src/index.types-check.ts
// This file is now named index.types-check.ts to avoid Jest test glob.
// Run type checks with: npx tsc --noEmit src/index.types-check.ts
// Type-level tests for Heylock types
import {
	AgentOptions,
	Message,
	ContextEntry,
	UsageRemaining,
	ShouldEngageResult,
	SortResult,
	default as Heylock
} from '../types';

type _CheckAgentOptions = AgentOptions;
type _CheckMessage = Message;
type _CheckContextEntry = ContextEntry;
type _CheckUsageRemaining = UsageRemaining;
type _CheckShouldEngageResult = ShouldEngageResult;
type _CheckSortResult = SortResult;

declare const agent: Heylock;

// Check readonly properties
const usage: UsageRemaining = agent.usageRemaining;
// @ts-expect-error
usage.messages = 123;

const msgHistory: ReadonlyArray<Message> = agent.messageHistory;
// @ts-expect-error
msgHistory.push({ content: 'bad', role: 'user' });

const context: ReadonlyArray<ContextEntry> = agent.context;
// @ts-expect-error
context.push({ content: 'bad', timestamp: 0 });

// Check method signatures
agent.addMessage('hi', 'user');
agent.removeMessage(0);
agent.modifyMessage(0, 'update', 'assistant');
agent.setMessageHistory([{ content: 'hi', role: 'user' }]);
agent.clearMessageHistory();
agent.addContextEntry('ctx', Date.now());
agent.removeContextEntry(0);
agent.modifyContextEntry(0, 'ctx2', Date.now());
agent.setContext([{ content: 'ctx', timestamp: Date.now() }]);
agent.clearContext();
agent.getContextString();
agent.fetchUsageRemaining();
agent.message('hi');
agent.messageStream('hi');
agent.greet('hi');
agent.shouldEngage('hi');
agent.rewrite('hi');
agent.sort(['a', 'b']);
