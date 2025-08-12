//#region Interfaces

/**
 * Configuration options for a Heylock agent.
 * All properties are optional.
 * @property useStorage - Whether to use localStorage in the browser.
 * @property suppressWarnings - Whether to suppress warnings in the console.
 * @property useMessageHistory - Whether to use chat history when generating a response.
 * @remarks Messages will still be saved to messageHistory unless you specify otherwise when using message(), messageStream(), or greet().
 *
 * @example
 * import Heylock from 'heylock';
 *
 * const agent = new Heylock('YOUR_AGENT_KEY', {
 *   useStorage: true,          // enable localStorage in the browser
 *   useMessageHistory: true,   // use message history for better answers
 *   suppressWarnings: false    // show helpful warnings in console
 * });
 */
export interface AgentOptions {
    useStorage?: boolean;
    useMessageHistory?: boolean;
    suppressWarnings?: boolean;
}

/**
 * Represents a single message stored in the agent's message history.
 * Includes the message content and the role of the sender ('user' or 'assistant').
 *
 * @example
 * // Add and read messages
 * import Heylock from 'heylock';
 * 
 * const agent = new Heylock('YOUR_AGENT_KEY');
 * 
 * agent.addMessage('Hello!', 'user');
 * agent.addMessage('Hi there!', 'assistant');
 * console.log(agent.messageHistory); // [{content:'Hello!', role:'user'}, {content:'Hi there!', role:'assistant'}]
 */
export interface Message {
    content: string;
    role: 'user' | 'assistant';
}

/**
 * Represents a single entry in the agent's context.
 * Includes the context content and a timestamp.
 *
 * @example
 * // Add a context entry so the agent can personalize responses
 * import Heylock from 'heylock';
 * 
 * const agent = new Heylock('YOUR_AGENT_KEY');
 *
 * agent.addContextEntry('User expanded the model description');
 * console.log(agent.getContextString()); // "User expanded the model description now."
 */
export interface ContextEntry {
    content: string;
    timestamp: number;
}

/**
 * Represents the remaining usage limits for a Heylock agent.
 * @property messages - Number of messages remaining, or null if unlimited/unknown.
 * @property sorts - Number of sorts remaining, or null if unlimited/unknown.
 * @property rewrites - Number of rewrites remaining, or null if unlimited/unknown.
 *
 * @example
 * // Fetch and read usage remaining
 * import Heylock from 'heylock';
 * 
 * const agent = new Heylock('YOUR_AGENT_KEY');
 *
 * agent.onInitialized(async (success) => {
 *   if (!success) return;
 * 
 *   const usage = await agent.fetchUsageRemaining();
 * 
 *   console.log('Messages left:', usage.messages);
 *   console.log('Sorts left:', usage.sorts);
 *   console.log('Rewrites left:', usage.rewrites);
 * });
 */
export interface UsageRemaining {
    messages: number | null;
    sorts: number | null;
    rewrites: number | null;
}

/**
 * Represents the result of a shouldEngage check.
 * @property shouldEngage - Whether the agent should engage (true/false).
 * @property reasoning - Explanation for the decision.
 * @property warning - Optional warning message (e.g., throttling).
 * @property fallback - Whether a fallback was used due to throttling or error.
 *
 * @example
 * // Decide if a chatbot should pop up now
 * import Heylock from 'heylock';
 * 
 * const agent = new Heylock('YOUR_AGENT_KEY');
 * 
 * agent.onInitialized(async () => {
 *   // Note: calls are throttled (15s). Avoid calling repeatedly inside loops.
 *   const res = await agent.shouldEngage('Only engage if user seems stuck on checkout');
 * 
 *   if (res.warning) console.warn(res.warning); // e.g., throttling notice
 * 
 *   if (res.shouldEngage === true) {
 *     agent.addMessage(await agent.greet("Help the visitor with checkout."), 'assistant');
 *   }
 * });
 */
export interface ShouldEngageResult {
    shouldEngage: boolean;
    reasoning: string;
    warning?: string;
    fallback: boolean;
}


/**
 * Represents the result of an AI-powered sort.
 * @property array - Sorted array of items.
 * @property indexes - Indexes mapping original array to sorted order.
 * @property reasoning - Optional explanation for the sort order.
 * @property warning - Optional warning message.
 * @property fallback - True if a fallback was used.
 *
 * @example
 * import Heylock from 'heylock';
 * 
 * const agent = new Heylock('YOUR_AGENT_KEY');
 * 
 * agent.onInitialized(async () => {
 *   const products = [
 *     { name: 'Eco Bottle', price: 12 },
 *     { name: 'Steel Bottle', price: 25 },
 *     { name: 'Plastic Bottle', price: 3 }
 *   ];
 * 
 *   const result = await agent.sort(products, 'Order these products by which one the user is most likely to buy');
 * 
 *   console.log(result.array);
 * });
 */
export interface SortResult {
    array: any[]; 
    indexes: number[];
    reasoning?: string;
    warning?: string;
    fallback?: boolean;
}

//#endregion

/**
 * This class enables easy integration of AI agents into your application.
 *
 * @example
 * // Node 18+ (ESM)
 * import Heylock from 'heylock';
 * 
 * const agent = new Heylock('YOUR_AGENT_KEY');
 * 
 * agent.onInitialized(async (success) => {
 *   if (!success) return console.error('Failed to initialize');
 * 
 *   const reply = await agent.message('Hello!');
 * 
 *   console.log('Agent:', reply);
 * });
 *
 * @example
 * // Browser (bundlers like Vite/Next) — ESM import is the same
 * import Heylock from 'heylock';
 * 
 * const agent = new Heylock('YOUR_AGENT_KEY', { useStorage: true });
 * 
 * // It takes a moment to initialize; you can wait via callback or a simple check
 * agent.onInitialized(async () => {
 *   const hello = await agent.message('Hi there!');
 * 
 *   console.log(hello);
 * });
 *
 * // Or: simple check (only if you need to call immediately after initialization)
 * const waitForInit = async (agentInstance) => { while (!agentInstance.isInitialized) await new Promise(resolve => setTimeout(resolve, 50)); };
 * await waitForInit(agent);
 * 
 * console.log(await agent.message('Ready!'));
 *
 * @param agentKey - The key for authenticating the agent.
 * @param options - Configuration options for the agent.
 *
 * @see AgentOptions
 */
export default class Heylock {
    /**
     * Creates an instance of the Heylock agent.
     * Verifies the agentKey argument and throws an error if the key is invalid or verification fails.
     * If useStorage is enabled, retrieves data from localStorage.
     *
     * @param agentKey - The authentication key for the agent. Must be a non-empty string.
     * @param options - Optional configuration settings for the agent.
     * 
     * @see AgentOptions
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     *
     * agent.onInitialized((success) => {
     *   if (!success) console.error('Init failed');
     * });
     */
    constructor(agentKey: string, options?: AgentOptions) {}

    //#region Agent properties

    /**
     * Indicates whether the agent has been successfully initialized.
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * // Simple wait loop if you need to start right away
     * while (!agent.isInitialized) {
     *   await new Promise(resolve => setTimeout(resolve, 50));
     * }
     * 
     * console.log('Ready');
     */
    isInitialized: boolean;

    /**
     * Gets the remaining usage for the agent.
     * @readonly
     * @see UsageRemaining
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * agent.onInitialized(async () => {
     *   const usage = await agent.fetchUsageRemaining();
     * 
     *   console.log(usage.messages, usage.sorts, usage.rewrites);
     * });
     */
    readonly usageRemaining: UsageRemaining;

    /**
     * Gets the message history for the agent.
     * Each message contains content and a role ('user' or 'assistant').
     * @readonly
     * @see Message
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * agent.addMessage('Hi', 'user');
     *
     * console.log(agent.messageHistory); // [{ content: 'Hi', role: 'user' }]
     */
    readonly messageHistory: Array<Message>;

    /**
     * Gets the context for the agent.
     * Each context entry contains content and a timestamp.
     * @readonly
     * @see ContextEntry
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * agent.addContextEntry('User loves sci-fi books');
     * 
     * console.log(agent.context[0].content); // 'User loves sci-fi books'
     */
    readonly context: Array<ContextEntry>;

    //#endregion

    //#region Callbacks

    /**
     * Registers a callback to be called when the agent is initialized.
     * @param callback - Function called when initialization completes. Receives a boolean indicating success (true) or failure (false).
     * @returns Unsubscribe function to remove the callback.
     * @remarks The callback is triggered for both success and failure. Edge cases to consider include invalid agentKey, network errors, or accidental agent deletion.
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     *
     * const unsubscribe = agent.onInitialized(async (success) => {
     *   if (!success) return console.error('Initialization failed');
     *
     *   console.log('Initialized!');
     *
     *   unsubscribe(); // unsubscribe if no longer needed
     * });
     */
    onInitialized(callback: (success: boolean) => void): () => void;

    /**
     * Registers a callback to be called when the message history changes.
     * @param callback - Function called when the message history changes. Receives the new message history array.
     * @returns Unsubscribe function to remove the callback.
     * @see Message
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * const unsubscribe = agent.onMessageHistoryChange((history) => {
     *   console.log('History size:', history.length);
     * });
     * 
     * agent.addMessage('Hello', 'user');
     */
    onMessageHistoryChange(callback: (messageHistory: Array<Message>) => void): () => void;

    /**
     * Registers a callback to be called when the context changes.
     * @param callback - Function called with the new context array.
     * @returns Unsubscribe function to remove the callback.
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY', { useStorage: true });
     *
     * const unsubscribe = agent.onContextChange((context) => {
     *   console.log('Context entries:', context.length);
     * });
     * 
     * agent.addContextEntry('User hovers over low-sugar snacks');
     */
    onContextChange(callback: (context: Array<ContextEntry>) => void): () => void;

    //#endregion

    //#region Message history management

    /**
     * Adds a message to the agent's message history.
     * @param content - The message content.
     * @param role - The role of the sender ('user' or 'assistant'). Defaults to 'user'.
     * @returns The index of the newly added message.
     * @throws Error if content is not a string, too long, or role is invalid.
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     *
     * const index = agent.addMessage('Hey!', 'user');
     *
     * console.log('Added at index', index);
     */
    addMessage(content: string, role?: 'user' | 'assistant'): number;

    /**
     * Removes a message from the message history by index.
     * @param index - The index of the message to remove.
     * @throws Error if index is out of bounds or invalid.
     *
     * @example
     * agent.removeMessage(0);
     */
    removeMessage(index: number): void;

    /**
     * Modifies an existing message in the message history.
     * @param index - The index of the message to modify.
     * @param content - The new message content.
     * @param role - The new role ('user' or 'assistant'). Optional.
     * @throws Error if index/content/role are invalid.
     *
     * @example
     * agent.modifyMessage(0, 'Updated text');
     */
    modifyMessage(index: number, content: string, role?: 'user' | 'assistant'): void;

    /**
     * Replaces the entire message history with a new array.
     * @param messageHistory - Array of message objects.
     * @throws Error if the array or its contents are invalid.
     * @see Message
     *
     * @example
     * agent.setMessageHistory([
     *   { content: 'Hi', role: 'user' },
     *   { content: 'Hello!', role: 'assistant' }
     * ]);
     */
    setMessageHistory(messageHistory: Array<Message>): void;

    /**
     * Clears all messages from the message history.
     *
     * @example
     * agent.clearMessageHistory();
     */
    clearMessageHistory(): void;

    //#endregion

    //#region Context management

    /**
     * Adds a new entry to the agent's context.
     * @param content - The context information to add. Must be a non-empty string.
     * @param timestamp - Optional timestamp in milliseconds since Unix epoch (January 1, 1970 UTC). If not provided, the current time is used.
     * @returns The index of the added context entry.
     * @throws Error if content is invalid (e.g., not a string or empty), or if timestamp is not a valid number.
     *
     * @example
     * // Add context to personalize agent responses
     * const index = agent.addContextEntry('User opened Berlin accommodations catalog');
     * 
     * console.log('Context index:', index);
     */
    addContextEntry(content: string, timestamp?: number): number;

    /**
     * Removes a context entry by index.
     * @param index - The index of the context entry to remove.
     * @throws Error if index is out of bounds or invalid.
     *
     * @example
     * agent.removeContextEntry(0);
     */
    removeContextEntry(index: number): void;

    /**
     * Modifies an existing context entry.
     * @param index - The index of the context entry to modify.
     * @param content - The new context content.
     * @param timestamp - The new timestamp (optional).
     * @throws Error if index/content/timestamp are invalid.
     *
     * @example
     * agent.modifyContextEntry(0, 'Switched to dark mode');
     */
    modifyContextEntry(index: number, content: string, timestamp?: number): void;

    /**
     * Replaces the entire context with a new array.
     * @param contextArray - Array of context entries.
     * @throws Error if the array or its contents are invalid.
     * @see ContextEntry
     *
     * @example
     * agent.setContext([
     *   { content: 'Played jazz', timestamp: Date.now() - 60000 },
     *   { content: 'Opened gifts catalog', timestamp: Date.now() }
     * ]);
     */
    setContext(contextArray: Array<ContextEntry>): void;

    /**
     * Clears all context entries.
     *
     * @example
     * agent.clearContext();
     */
    clearContext(): void;

    /**
     * Returns a formatted string representation of the context.
     * @returns A string describing the context entries and their timestamps.
     *
     * @example
     * console.log(agent.getContextString()); // "Played jazz 1 minute ago. Opened gifts catalog now."
     */
    getContextString(): string;

    //#endregion

    //#region Usage route

    /**
     * Fetches the agent's remaining usage limits from the server.
     * @returns Promise that resolves to a UsageRemaining object with the current limits for messages, sorts, and rewrites.
     * @throws Error if the agent is not initialized, authorization fails, or a network/server error occurs.
     * @see UsageRemaining
     *
     * @example
     * try {
     *   const usage = await agent.fetchUsageRemaining();
     * 
     *   console.log('Remaining:', usage);
     * } catch (err) {
     *   console.error('Could not fetch limits', err);
     * }
     */
    fetchUsageRemaining(): Promise<UsageRemaining>;

    //#endregion

    //#region Message route

    /**
     * Sends a message to the agent and receives a response.
     * @param content - The message content to send.
     * @param useContext - Whether to include context in the request. Defaults to true.
     * @param saveToMessageHistory - Whether to save the message and response to history. Defaults to true.
     * @returns Promise that resolves to the agent's response string.
     * @throws Error if the agent is not initialized, arguments are invalid, or a network/server error occurs.
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * agent.onInitialized(async () => {
     *   // Optionally add context
     *   agent.addContextEntry('User likes quick, concise answers about jazz');
     * 
     *   try {
     *     const reply = await agent.message('Give me a one-sentence tip');
     *     console.log(reply);
     *   } catch (error) {
     *     console.error('Message failed', error);
     *   }
     * });
     */
    message(content: string, useContext?: boolean, saveToMessageHistory?: boolean): Promise<string>;

    /**
     * Sends a message to the agent and receives a streamed response (async generator).
     * @param content - The message content to send.
     * @param useContext - Whether to include context in the request. Defaults to true.
     * @param saveToMessageHistory - Whether to save the message and response to history. Defaults to true.
     * @returns Async generator yielding response chunks as strings.
     * @throws Error if the agent is not initialized, arguments are invalid, or a network/server error occurs.
     *
     * @example
     * // Stream and log chunks as they arrive (for-await)
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * agent.onInitialized(async () => {
     *   for await (const chunk of agent.messageStream('Explain in small steps...')) {
     *     console.log(chunk);
     *   }
     *   // messageHistory is updated internally as the stream progresses
     * });
     *
     * @example
     * // Collect streamed chunks into a single string
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * agent.onInitialized(async () => {
     *   let full = '';
     * 
     *   for await (const chunk of agent.messageStream('List three tips about focus')) {
     *     full += chunk;
     *   }
     * 
     *   console.log('\nFull:', full);
     * });
     */
    messageStream(content: string, useContext?: boolean, saveToMessageHistory?: boolean): AsyncGenerator<string, string, unknown>;

    /**
     * Returns a greeting message from the agent.
     * @param instructions - Optional instructions for the greeting.
     * @param useContext - Whether to include context in the request. Defaults to true.
     * @param saveToMessageHistory - Whether to save the greeting to history. Defaults to true.
     * @returns Promise that resolves to the agent's greeting string.
     * @throws Error if the arguments are invalid or a network/server error occurs.
     *
     * @example
     * const greeting = await agent.greet();
     * console.log(greeting); // "Hi! I'm here to help you!"
     *
     * @example
     * // With instructions and context
     * agent.addContextEntry('Visitor opened pricing page');
     * 
     * const personalized = await agent.greet('Mention the current discount');
     * console.log(personalized);
     */
    greet(instructions?: string, useContext?: boolean, saveToMessageHistory?: boolean): Promise<string>;

    //#endregion

    //#region Should-Engage route

    /**
     * Checks if the agent should engage with the user, based on instructions and context.
     * Throttles requests to prevent excessive calls.
     * @param instructions - Optional instructions for engagement.
     * @returns Promise that resolves to a ShouldEngageResult object.
     * @throws Error if arguments are invalid, throttling is in effect, or a network/server error occurs.
     * @see ShouldEngageResult
     *
     * @example
     * // Note: calls are throttled (about 15s). Avoid calling repeatedly inside loops.
     * const decision = await agent.shouldEngage('Engage if user idles on checkout for >30s');
     * 
     * if (decision.warning) console.warn(decision.warning);
     * 
     * console.log('Engage?', decision.shouldEngage, 'Reason:', decision.reasoning);
     */
    shouldEngage(instructions?: string): Promise<ShouldEngageResult>;
    
    //#endregion

    //#region Rewrite route

    /**
     * Rewrites the given content according to optional instructions and context.
     * @param content - The text content to rewrite. Must be a non-empty string.
     * @param instructions - Optional instructions for the rewrite. Must be a string if provided.
     * @param useContext - Whether to include context in the rewrite request. Defaults to true.
     * @returns Promise that resolves to the rewritten text string.
     * @throws Error if arguments are invalid, usage limits are exceeded, authorization fails, or a network/server error occurs.
     *
     * @example
     * agent.addContextEntry('Tone preference: friendly and concise');
     * 
     * const improved = await agent.rewrite('pls ship my order fast', 'Fix grammar and be polite');
     * 
     * console.log(improved); // "Please ship my order quickly. Thank you!"
     */
    rewrite(content: string, instructions?: string, useContext?: boolean): Promise<string>;

    //#endregion

    //#region Sort route

    /**
     * Sorts an array using AI, with optional instructions and context for personalization.
     * Returns a SortResult containing the sorted array and reasoning.
     * @param array - The array to sort.
     * @param instructions - Optional instructions for sorting (e.g., "Order by the likelihood of purchase").
     * @param useContext - Whether to use context for sorting (default: true).
     * @returns Promise resolving to a SortResult.
     *
     * @example
     * import Heylock from 'heylock';
     * 
     * const agent = new Heylock('YOUR_AGENT_KEY');
     * 
     * agent.onInitialized(async () => {
     *   const products = [
     *     { name: 'Eco Bottle', price: 12 },
     *     { name: 'Steel Bottle', price: 25 },
     *     { name: 'Plastic Bottle', price: 3 }
     *   ];
     * 
     *   const result = await agent.sort(products, 'Order these products by which one the user is most likely to buy');
     * 
     *   console.log(result.array);
     * });
     */
    sort(array: any[], instructions?: string, useContext?: boolean): Promise<SortResult>;
    
    //#endregion
}