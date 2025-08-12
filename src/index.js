const MAX_MESSAGE_LENGTH = 10000;
const MAX_CONTEXT_ENTRY_LENGTH = 2000;
const SHOULD_ENGAGE_THROTTLING_MS = 15000;

export default class Heylock{    
    //#region Initialization
    constructor(agentKey, options = {}){
        this.agentKey = agentKey;

        this.useStorage = options.useStorage ?? true;
        this.useMessageHistory = options.useMessageHistory ?? true;
        this.suppressWarnings = options.suppressWarnings ?? false;
        
        //#region Validate arguments
        if(typeof agentKey !== 'string' || agentKey.length <= 0){
            throw new Error("Agent initialization failed: agentKey must be a non-empty string.");
        }
        
        if(typeof this.useStorage !== 'boolean'){
            throw new Error("Agent initialization failed: useStorage must be a boolean.");
        }

        if(typeof this.useMessageHistory !== 'boolean'){
            throw new Error("Agent initialization failed: useMessageHistory must be a boolean.");
        }
        //#endregion

        //#region Manage context in storage
        if(this.useStorage){
            this.onContextChange(() => {
                this.#setStorageItem('context', this.context);
            });

            const contextStorageString = this.#getStorageItem('context');

            if (contextStorageString) {
                try {
                    const parsedContext = JSON.parse(contextStorageString);

                    // Validate parsedContext is an array of valid context entries
                    if (Array.isArray(parsedContext) && parsedContext.every(entry => typeof entry === 'object' && entry !== null && typeof entry.content === 'string' && entry.content.trim().length > 0 && entry.content.length <= MAX_CONTEXT_ENTRY_LENGTH && (entry.timestamp === undefined || (typeof entry.timestamp === 'number' && entry.timestamp >= 0 && Number.isFinite(entry.timestamp))))) {
                        // Defensive copy to prevent mutation
                        this.#context = parsedContext.map(entry => ({
                            content: entry.content.trim(),
                            timestamp: entry.timestamp ?? new Date().getTime()
                        }));
                    } else {
                        !this.suppressWarnings && console.warn("Stored context is invalid. Context will not be restored.");
                    }
                } catch (error) {
                    !this.suppressWarnings && console.warn("Failed to parse stored context. Context will not be restored.");
                }
            }


        }
        //#endregion

        this.#initializeAgent(agentKey);
    }

    async #initializeAgent(agentKey){
        try{
            const verifyKeyRes = await fetch("https://heylock.dev/api/internal/verifyKey", {
                method: 'POST',
                body: JSON.stringify({
                    key: agentKey
                })
            });

            if(verifyKeyRes.status === 500){
                throw new Error("Agent initialization failed: we are experiencing temporary server issues. Please try again later.");
            } 
            
            else if(verifyKeyRes.status !== 200){
                throw new Error("Agent initialization failed: something went wrong. Please check your internet connection and try again.");
            }

            else if(verifyKeyRes.status === 200){
                const verifyKeyData = await verifyKeyRes.json();

                if(typeof verifyKeyData.valid !== 'boolean'){
                    throw new Error("Agent initialization failed: received an unexpected response from the server. Please ensure you are using the correct version of the package.");
                }
                
                if(verifyKeyData.valid === false){
                    throw new Error("Agent initialization failed: the provided agentKey is invalid. Please verify your key and try again.");
                }

                this.#isInitialized = true;

                //Must be called after isInitialized is set to true
                await this.fetchUsageRemaining();

                this.#onInitializedExecute();
            }
        } catch(error){
            if(error.message.includes("Agent initialization failed: ")){
                throw new Error(error.message);
            }
            
            throw new Error(
                "Agent initialization failed: an unexpected error occurred. " +
                "Please ensure you are using the correct version of the package. " +
                `Error details: ${error}`
            );
        }
    }
    //#endregion        

    //#region Public variables
    #isInitialized = false;
    get isInitialized() {
        return this.#isInitialized ?? false;
    }

    #usageRemaining = {
        messages: null,
        sorts: null,
        rewrites: null
    }
    get usageRemaining(){
        return this.#usageRemaining ?? {
            messages: null,
            sorts: null,
            rewrites: null
        }
    }

    #messageHistory = [];
    get messageHistory(){
        return this.#messageHistory ?? [];
    }

    #context = [];
    get context(){
        return this.#context ?? [];
    }
    //#endregion

    //#region Callbacks

        //#region on Initialized
        #onInitializedCallbacks = [];

        onInitialized(callback){
            if(typeof callback !== 'function'){
                throw new Error("onInitialized failed: callback must be a function.");
            }

            const newArrayLength = this.#onInitializedCallbacks.push(callback);

            return () => {
                const index = newArrayLength - 1;
                
                if (index !== -1) {
                    this.#onInitializedCallbacks.splice(index, 1);                    
                }
            };
        }

        #onInitializedExecute(){
            [...this.#onInitializedCallbacks].forEach(callback => {
                try {                    
                    callback(this.isInitialized);
                } catch (error) {
                    !this.suppressWarnings && console.warn("onInitialized callback error:", error);
                }
            });
        }
        //#endregion

        //#region Message history change 
        #onMessageHistoryChangeCallbacks = [];

        onMessageHistoryChange(callback) {
            if (typeof callback !== 'function') {
                throw new Error("onMessageHistoryChange failed: callback must be a function.");
            }

            this.#onMessageHistoryChangeCallbacks.push(callback);

            return () => {
                const index = this.#onMessageHistoryChangeCallbacks.indexOf(callback);

                if (index !== -1) {
                    this.#onMessageHistoryChangeCallbacks.splice(index, 1);
                }
            };
        }

        #onMessageHistoryChangeExecute(){
            // Use forEach for side effects; protect each callback from others' errors
            this.#onMessageHistoryChangeCallbacks.forEach(callback => {
                try {
                    callback(this.messageHistory);
                } catch (err) {
                    !this.suppressWarnings && console.warn("onMessageHistoryChange callback error:", err);
                }
            });
        }
        //#endregion

        //#region Context change
        #onContextChangeCallbacks = [];

        onContextChange(callback) {
            if (typeof callback !== 'function') {
                throw new Error("onContextChange failed: callback must be a function.");
            }
            
            this.#onContextChangeCallbacks.push(callback);

            return () => {
                const index = this.#onContextChangeCallbacks.indexOf(callback);

                if (index !== -1) {
                    this.#onContextChangeCallbacks.splice(index, 1);
                }
            };
        }

        #onContextChangeExecute(){
            // Use forEach for side effects; protect each callback from others' errors
            this.#onContextChangeCallbacks.forEach(callback => {
        
            try {
                callback(this.context);
            } catch (err) {
                !this.suppressWarnings && console.warn("onContextChange callback error:", err);
            }
            });
        }
        //#endregion
   
    //#endregion

    //#region Message history management
    addMessage(content, role = "user"){
        //#region Validate arguments
        if(typeof content !== 'string'){
            throw new Error("addMessageToHistory failed: content must be a string.");
        }
        
        if(content.length > MAX_MESSAGE_LENGTH){
            throw new Error(`addMessageToHistory failed: content exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`);
        }
        
        if(role !== 'user' && role !== 'assistant'){
            throw new Error("addMessageToHistory failed: role must be either 'user' or 'assistant'.");
        }
        //#endregion

        const newLength = this.#messageHistory.push({
            content: content.trim(),
            role: role
        });
        
        this.#onMessageHistoryChangeExecute();
        
        return newLength-1;
    }

    removeMessage(index){
        //#region Validate arguments
        if(typeof index !== 'number' || index < 0){
            throw new Error("removeMessage failed: index must be a number greater than or equal to 0.");
        }

        if(index > (this.#messageHistory.length-1)){
            throw new Error(`removeMessage failed: index ${index} is out of bounds for message history of length ${this.#messageHistory.length}.`);
        }
        //#endregion

        this.#messageHistory.splice(index, 1);

        this.#onMessageHistoryChangeExecute();
    }

    modifyMessage(index, content, role){
        //#region Validate arguments
        if(typeof index !== 'number' || index < 0){
            throw new Error("modifyMessage failed: index must be a number greater than or equal to 0.");
        }

        if(index > (this.#messageHistory.length-1)){
            throw new Error(`modifyMessage failed: index ${index} is out of bounds for message history of length ${this.#messageHistory.length}.`);
        }
        
        if(typeof content !== 'string' || content.trim().length === 0){
            throw new Error("modifyMessage failed: content must be a non-empty string.");
        }
        
        if(content.length > MAX_MESSAGE_LENGTH){
            throw new Error(`modifyMessage failed: content exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`);
        }
        
        if(role && (role !== 'user' && role !== 'assistant')){
            throw new Error("modifyMessage failed: role must be either 'user' or 'assistant'.");
        }
        //#endregion

        this.#messageHistory[index].content = content.trim();
        this.#messageHistory[index].role = role || this.#messageHistory[index].role;

        this.#onMessageHistoryChangeExecute();
    }

    setMessageHistory(messageHistory){
        //#region Validate argument
        if (!Array.isArray(messageHistory)) {
            throw new Error("setMessageHistory failed: messageHistory must be an array.");
        }

        // Validate each message object in the array
        for (let index = 0; index < messageHistory.length; index++) {
            const message = messageHistory[index];

            // Check for missing or invalid properties
            if (typeof message !== 'object' || message === null || typeof message.content !== 'string' || message.content.length > MAX_MESSAGE_LENGTH || (message.role !== 'user' && message.role !== 'assistant')) {
                throw new Error(
                    `setMessageHistory failed: message at index ${index} is invalid. ` +
                    "Each message must be an object with a string 'content' (max length " +
                    `${MAX_MESSAGE_LENGTH}) and 'role' of either 'user' or 'assistant'.`
                );
            }
        }
        //#endregion

        // Defensive copy to prevent external mutation
        this.#messageHistory = messageHistory.map(message => ({
            content: message.content.trim(),
            role: message.role
        }));

        this.#onMessageHistoryChangeExecute();
    }

    clearMessageHistory(){
        this.#messageHistory = [];

        this.#onMessageHistoryChangeExecute();
    }
    //#endregion

    //#region Context management
    addContextEntry(content, timestamp){
        //#region Validate arguments
        if (typeof content !== 'string' || content.trim().length === 0) {
            throw new Error(`addContextEntry failed: content must be a non-empty string.`);
        }
        if (content.length > MAX_CONTEXT_ENTRY_LENGTH) {
            throw new Error(`addContextEntry failed: content exceeds maximum allowed length of ${MAX_CONTEXT_ENTRY_LENGTH} characters.`);
        }

        if (timestamp !== undefined && (typeof timestamp !== 'number' || timestamp < 0 || !Number.isFinite(timestamp))) {
            throw new Error("addContextEntry failed: timestamp must be a finite, non-negative number if provided.");
        }

        // Warn if timestamp is in the future
        if (timestamp !== undefined && typeof timestamp === 'number' && Number.isFinite(timestamp)) {
            const now = Date.now();
            
            if (timestamp > now) {
                console.warn("addContextEntry warning: timestamp is in the future. This may lead to unexpected behavior.");
            }
        }
        //#endregion

        const newArrayLength = this.#context.push({
            content: content.trim(),
            timestamp: timestamp ?? new Date().getTime()
        });

        this.#onContextChangeExecute();

        return newArrayLength - 1;
    }

    removeContextEntry(index) {
        //#region Validate arguments
        if (typeof index !== 'number' || index < 0) {
            throw new Error("removeContextEntry failed: index must be a number greater than or equal to 0.");
        }

        if (index > (this.#context.length - 1)) {
            throw new Error(`removeContextEntry failed: index ${index} is out of bounds for context of length ${this.#context.length}.`);
        }
        //#endregion

        // Remove the context entry
        this.#context.splice(index, 1);

        this.#onContextChangeExecute();
    }

    modifyContextEntry(index, content, timestamp) {
        //#region Validate arguments
        // Validate index
        if (typeof index !== 'number' || index < 0) {
            throw new Error("modifyContextEntry failed: index must be a number greater than or equal to 0.");
        }

        if (index > (this.#context.length - 1)) {
            throw new Error(`modifyContextEntry failed: index ${index} is out of bounds for context of length ${this.#context.length}.`);
        }

        if (typeof content !== 'string' || content.trim().length === 0) {
            throw new Error("modifyContextEntry failed: content must be a non-empty string if provided.");
        }

        if (content.length > MAX_CONTEXT_ENTRY_LENGTH) {
            throw new Error(`modifyContextEntry failed: content exceeds maximum allowed length of ${MAX_CONTEXT_ENTRY_LENGTH} characters.`);
        }

        // Validate timestamp if provided
        if (timestamp !== undefined) {
            if (typeof timestamp !== 'number' || timestamp < 0 || !Number.isFinite(timestamp)) {
                throw new Error("modifyContextEntry failed: timestamp must be a finite, non-negative number if provided.");
            }
        }

        // Warn if timestamp is in the future
        if (timestamp !== undefined && typeof timestamp === 'number' && Number.isFinite(timestamp)) {
            const now = Date.now();
            
            if (timestamp > now) {
                console.warn("modifyContextEntry warning: timestamp is in the future. This may lead to unexpected behavior.");
            }
        }
        //#endregion

        const newContextEntry = {
            content: content.trim() ?? this.#context[index].content,
            timestamp: timestamp ?? this.#context[index].timestamp
        }

        this.#context[index] = newContextEntry;

        this.#onContextChangeExecute();
    }

    setContext(contextArray) {
        //#region Validate argument
        if (!Array.isArray(contextArray)) {
            throw new Error("setContext failed: contextArray must be an array.");
        }

        for (let index = 0; index < contextArray.length; index++) {
            const entry = contextArray[index];

            if (typeof entry !== 'object' || entry === null 
                || typeof entry.content !== 'string' || entry.content.trim().length <= 0 || entry.content.length > MAX_CONTEXT_ENTRY_LENGTH || 
                (entry.timestamp !== undefined && (typeof entry.timestamp !== 'number' || entry.timestamp < 0 || !Number.isFinite(entry.timestamp)))
            ) {
                throw new Error(
                    `setContext failed: entry at index ${index} is invalid. ` +
                    "Each entry must be an object with a non-empty string 'content' (max length " +
                    `${MAX_CONTEXT_ENTRY_LENGTH}) and an optional finite, non-negative 'timestamp'.`
                );
            }

            // Warn if timestamp is in the future
            if (entry.timestamp !== undefined && typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)) {
                const now = Date.now();
                
                if (timestamp > now) {
                    console.warn("setContext warning: timestamp is in the future. This may lead to unexpected behavior.");
                }
            }
        }
        //#endregion

        // Defensive copy
        this.#context = contextArray.map(entry => ({
            content: entry.content.trim(),
            timestamp: entry.timestamp ?? new Date().getTime()
        }));

        this.#onContextChangeExecute();
    }

    clearContext() {
        this.#context = [];

        this.#onContextChangeExecute();
    }

    getContextString(){
        let contextString = "";

        function formatTimestampAgo(timestamp) {
            // Edge case: invalid timestamp
            if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0) return "";

            const now = Date.now();
            const differenceMs = now - timestamp;

            // Edge case: future timestamp
            if (differenceMs < 0) return "in the future";

            const seconds = Math.floor(differenceMs / 1000);
            if (seconds < 1) return "now";
            if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;

            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

            const days = Math.floor(hours / 24);
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        };

        this.#context.map(entry => {
            contextString += `${entry.content} ${formatTimestampAgo(entry.timestamp)}. `;
        });

        return contextString;
    }
    //#endregion

    //#region Storage management
    #setStorageItem(key, value){
        //#region Validate arguments
        if (typeof key !== 'string' || key.length === 0) {
            throw new Error("#setStorageItem failed: key must be a non-empty string.");
        }
        
        if (typeof value === 'undefined') {
            throw new Error("#setStorageItem failed: value must not be undefined.");
        }
        //#endregion

        //#region Validate environment
        const isNode = typeof process !== 'undefined' && process.versions !== null && process.versions.node !== null;
        const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

        if(isNode && !isBrowser){
            !this.suppressWarnings && console.warn("Data can only be saved in a browser environment.");
            return;
        }
        //#endregion

        try{
            localStorage.setItem(key, JSON.stringify(value));
        } catch(error){
            !this.suppressWarnings && console.warn("Data was not saved due to an unexpected error.");
        }
    }

    #getStorageItem(key){
        //#region Validate argument
        if(typeof key !== 'string' || key.trim().length <= 0){
            throw new Error("getStorageItem failed: key must be a non-empty string.");
        }
        //#endregion

        //#region Validate environment
        const isNode = typeof process !== 'undefined' && process.versions !== null && process.versions.node !== null;
        const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

        if(isNode && !isBrowser){
            !this.suppressWarnings && console.warn("Data can only be retrieved in a browser environment.");
            return;
        }
        //#endregion
    
        try{
            return localStorage.getItem(key);
        } catch(error){
            !this.suppressWarnings && console.warn("Data was not retrieved due to an unexpected error.");
        }
    }
    //#endregion

    //#region Limit route
    async fetchUsageRemaining(){
        if (!this.isInitialized) {
            throw new Error("fetchLimits failed: agent is not initialized. Please wait for initialization to complete.");
        }

        try{
            //#region Fetch the API
            const limitsRes = await fetch("https://heylock.dev/api/v1/limits", {
                method: 'GET',
                headers: {
                    'Authorization': this.agentKey
                }
            });
            //#endregion

            //#region Handle http codes
            if(limitsRes.status === 401){
                throw new Error("fetchUsageRemaining failed: authorization failed. Please check your agent key and try again.");
            }
            
            else if(limitsRes.status === 500){
                throw new Error("fetchUsageRemaining failed: we are experiencing temporary server issues. Please try again later.");
            }

            else if(limitsRes.status === 503){
                throw new Error("fetchUsageRemaining failed: the server is busy.");
            }
            
            else if(limitsRes.status !== 200){
                throw new Error("fetchUsageRemaining failed: something went wrong. Please check your internet connection and ensure you are using the correct package version.");
            } 
            
            else if(limitsRes.status === 200){
                const limitsData = await limitsRes.json();
                
                const newRemaining = {
                    messages: limitsData.limits.messages.remaining,
                    sorts: limitsData.limits.sorts.remaining,
                    rewrites: limitsData.limits.rewrites.remaining,
                }

                this.#usageRemaining = newRemaining;

                return this.usageRemaining;
            }
            //#endregion
        } catch(error){
            if(error.message.includes("fetchUsageRemaining failed: ")){
                throw new Error(error.message);
            }
            
            throw new Error(
                "fetchUsageRemaining failed: an unexpected error occurred. " +
                "Please ensure you are using the correct version of the package. " +
                `Error details: ${error}`
            );
        }
    }
    //#endregion

    //#region Message route
    async message(content, useContext = true, saveToMessageHistory = true){
        if (!this.isInitialized) {
            throw new Error("message failed: agent is not initialized. Please wait for initialization to complete.");
        }

        //#region Validate arguments
        if (typeof content !== 'string' || content.trim().length === 0) {
            throw new Error("message failed: content must be a non-empty string");
        }
    
        if (content.length > MAX_MESSAGE_LENGTH) {
            throw new Error(`message failed: content exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`);
        }
        
        if(typeof saveToMessageHistory !== 'boolean'){
            throw new Error("message failed: saveToMessageHistory must be a boolean.");
        }

        if(typeof useContext !== 'boolean'){
            throw new Error("message failed: useContext must be a boolean.");
        }
        //#endregion

        saveToMessageHistory && this.addMessage(content, 'user');

        try{
            //#region Fetching the API
            const messageRes = await fetch("https://heylock.dev/api/v1/message", {
                method: 'POST',
                headers: {
                    'Authorization': this.agentKey
                },
                body: JSON.stringify({
                    content: content, 
                    history: this.useMessageHistory && this.messageHistory,
                    stream: false,
                    context: useContext && this.getContextString()
                })
            });
            //#endregion

            //#region Setting rate limits
            const rateLimitRemainingHeader = messageRes.headers.get('x-ratelimit-remaining');
            const rateLimitRemaining = Number(rateLimitRemainingHeader);

            if(!isNaN(rateLimitRemaining) && rateLimitRemainingHeader !== null){
                this.#usageRemaining.messages = rateLimitRemaining;
            } else {
                this.#usageRemaining.messages--;
            }
            //#endregion

            //#region Handling scenarios based on HTTP codes
            if(messageRes.status === 500){
                throw new Error("message failed: we are experiencing temporary server issues. Please try again later.");
            } 

            else if(messageRes.status === 400){
                throw new Error("message failed: please check arguments. Refer to the documentation for more information (see documentation link)."); // Add documentation link
            }
            
            else if(messageRes.status === 401){
                throw new Error("message failed: authorization failed. Please check your agent key and try again.");
            }
            
            else if(messageRes.status === 429){
                if (!isNaN(rateLimitRemaining) && rateLimitRemaining <= 0) {
                    throw new Error("message failed: you have reached your message plan limit. Please upgrade your plan or wait for the limit to reset.");
                } else {
                    throw new Error("message failed: too many requests. Try again later.");
                }
            }

            else if(messageRes.status === 502){
                throw new Error("message failed: we are experiencing unexpected external service errors. Please try again later.");
            }

            else if(messageRes.status !== 200){
                throw new Error("message failed: something went wrong. Please check your internet connection or ensure you are using the correct package version.");
            } 
            
            // Successful scenario
            else if(messageRes.status === 200){
                const messageData = await messageRes.json();
                
                const output = messageData?.message;

                if(typeof output !== 'string'){
                    throw new Error("message failed: received an unexpected response from the server. Please ensure you are using the correct version of the package.");
                }

                saveToMessageHistory && this.addMessage(output, 'assistant'); 

                return output;
            }
            //#endregion
        } catch(error){
            if(error.message.includes("message failed: ")){
                throw new Error(error.message);
            }
            
            throw new Error(
                "message failed: an unexpected error occurred. " +
                "Please ensure you are using the correct version of the package. " +
                `Error details: ${error}`
            );
        }
    }

    async *messageStream(content, useContext = true, saveToMessageHistory = true){
        if (!this.isInitialized) {
            throw new Error("messageStream failed: agent is not initialized. Please wait for initialization to complete.");
        }

        //#region Validate arguments
        if (typeof content !== 'string' || content.trim().length === 0) {
            throw new Error("messageStream failed: content must be a non-empty string.");
        }

        if (content.length > MAX_MESSAGE_LENGTH) {
            throw new Error(`messageStream failed: content exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`);
        }

        if (typeof useContext !== 'boolean') {
            throw new Error("messageStream failed: useContext must be a boolean.");
        }

        if (typeof saveToMessageHistory !== 'boolean') {
            throw new Error("messageStream failed: saveToMessageHistory must be a boolean.");
        }
        //#endregion

        saveToMessageHistory && this.addMessage(content, 'user');
        const assistantMessageIndex = saveToMessageHistory && this.addMessage('', 'assistant');

        try{
            //#region Fetching the API
            // Must be let. Otherwise will be undefined.
            let historyForStream = Array.isArray(this.messageHistory) ? this.messageHistory.filter((message, index) => index !== assistantMessageIndex) : undefined;

            const messageRes = await fetch("https://heylock.dev/api/v1/message", {
                method: 'POST',
                headers: {
                    'Authorization': this.agentKey
                },
                body: JSON.stringify({
                    content: content,
                    history: this.useMessageHistory && historyForStream,
                    stream: true,
                    context: useContext && this.getContextString()
                })
            });
            //#endregion

            //#region Setting rate limits
            const rateLimitRemainingHeader = messageRes.headers.get('x-ratelimit-remaining');
            const rateLimitRemaining = Number(rateLimitRemainingHeader);

            if(!isNaN(rateLimitRemaining) && rateLimitRemainingHeader !== null){
                this.#usageRemaining.messages = rateLimitRemaining;
            } else {
                this.#usageRemaining.messages--;
            }
            //#endregion

            //#region Handling scenarios based on HTTP codes
            if(messageRes.status === 500){
                throw new Error("messageStream failed: we are experiencing temporary server issues. Please try again later.");
            } 

            else if(messageRes.status === 400){
                throw new Error("messageStream failed: please check arguments. Refer to the documentation for more information (see documentation link)."); // Add documentation link
            }
            
            else if(messageRes.status === 401){
                throw new Error("messageStream failed: authorization failed. Please check your agent key and try again.");
            }
            
            else if(messageRes.status === 429){
                if (!isNaN(rateLimitRemaining) && rateLimitRemaining <= 0) {
                    throw new Error("messageStream failed: you have reached your message plan limit. Please upgrade your plan or wait for the limit to reset.");
                } else {
                    throw new Error("messageStream failed: too many requests. Try again later.");
                }
            }

            else if(messageRes.status === 502){
                throw new Error("messageStream failed: we are experiencing unexpected external service errors. Please try again later.");
            }

            else if(messageRes.status !== 200){
                throw new Error("messageStream failed: something went wrong. Please check your internet connection or ensure you are using the correct package version.");
            } 
            
            // Successful scenario
            else if(messageRes.status === 200){
                const reader = messageRes.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullMessage = '';

                while(true){
                    const { done, value } = await reader.read();

                    if(done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');

                    buffer = lines.pop() || '';

                    for(const line of lines){
                        const trimmedLine = line.trim();

                        if(trimmedLine === '') continue;

                        try {
                            const chunk = JSON.parse(trimmedLine);

                            if(chunk.message && !chunk.done){
                                fullMessage += chunk.message;

                                saveToMessageHistory && this.modifyMessage(assistantMessageIndex, fullMessage, 'assistant');

                                yield chunk.message;
                            } else if(chunk.done){
                                return fullMessage;
                            }
                        } catch (parseError) {}
                    }
                }
            }
            //#endregion
            
        } catch(error){
            this.modifyMessage(assistantMessageIndex, "An error occurred while processing your request. Please try again later.");//Propogate on other message functions

            if(error.message.includes("messageStream failed: ")){
                throw new Error(error.message);
            }
            
            throw new Error(
                "messageStream failed: an unexpected error occurred. " +
                "Please ensure you are using the correct version of the package. " +
                `Error details: ${error}`
            );
        }
    }

    async greet(instructions, useContext = true, saveToMessageHistory = true){
        //#region Validate arguments
        if (typeof instructions !== 'string' || instructions.trim().length === 0) {
            if (instructions !== undefined && (typeof instructions !== 'string' || instructions.trim().length === 0)) {
                throw new Error("greet failed: instructions must be a non-empty string if provided.");
            }
        }

        if (instructions && instructions.length > MAX_MESSAGE_LENGTH) {
            throw new Error(`greet failed: instructions exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`);
        }

        if (typeof useContext !== 'boolean') {
            throw new Error("greet failed: useContext must be a boolean.");
        }

        if (typeof saveToMessageHistory !== 'boolean') {
            throw new Error("greet failed: saveToMessageHistory must be a boolean.");
        }
        //#endregion

        let effectiveInstructions = '';

        if(instructions){
            effectiveInstructions = `Write a greeting message encouraging the visitor to interact with you. Use instructions: ${instructions}`;
        } else {
            effectiveInstructions = 'Greet the visitor in one short, friendly sentence. Encourage interaction. Sound human.';
            if(useContext) effectiveInstructions += " Mention their interests or passions subtly.";
        }

        if(this.useMessageHistory && this.#messageHistory.length > 0){
            effectiveInstructions += ' Take into account our previous conversation history to make the greeting more personalized and contextual';
        }
        
        try{
            const output = await this.message(effectiveInstructions, true, false);

            this.addMessage(output, 'assistant');

            return output
        } catch(error){
            throw new Error(`greet failed - ${error}`);
        }
    }
    //#endregion

    //#region Should-Engage route
    #shouldEngageTimeCalled = 0;

    async shouldEngage(instructions){
        //#region Throttling
        const currentTime = new Date().getTime();

        if((currentTime - this.#shouldEngageTimeCalled) < SHOULD_ENGAGE_THROTTLING_MS){
            console.warn(`shouldEngage ignored: throttling in effect (${SHOULD_ENGAGE_THROTTLING_MS} ms). Please wait before calling again.`);
            return {
                shouldEngage: false,
                reasoning: '',
                warning: `Throttling in effect (${SHOULD_ENGAGE_THROTTLING_MS} ms). Please wait before calling again`,
                fallback: true
            };
        }

        this.#shouldEngageTimeCalled = currentTime;
        //#endregion

        //#region Validate arguments
        if (instructions !== undefined) {
            if (typeof instructions !== 'string' || instructions.trim().length === 0) {
                throw new Error("shouldEngage failed: instructions must be a non-empty string if provided.");
            }

            if (instructions.length > MAX_MESSAGE_LENGTH) {
                throw new Error(`shouldEngage failed: instructions exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`);
            }
        }
        //#endregion

        try{
            //#region Fetch the API
            const shouldEngageRes = await fetch("https://heylock.dev/api/v1/should-engage", {
                method: 'POST',
                headers: {
                    'Authorization': this.agentKey
                },
                body: JSON.stringify({
                    instructions: instructions,
                    context: this.getContextString()
                })
            });
            //#endregion

            //#region Handling scenarios based on HTTP codes
            if (shouldEngageRes.status === 400) {
                throw new Error("shouldEngage failed: invalid arguments. Please check your instructions and try again.");
            } 
            
            else if (shouldEngageRes.status === 401) {
                throw new Error("shouldEngage failed: authorization failed. Please check your agent key and try again.");
            } 

            else if (shouldEngageRes.status === 500) {
                throw new Error("shouldEngage failed: we are experiencing server issues. Please try again later.");
            } 
            
            else if (shouldEngageRes.status === 502) {
                throw new Error("shouldEngage failed: external service error. Please try again later.");
            } 
            
            else if (shouldEngageRes.status !== 200) {
                throw new Error(`shouldEngage failed: unexpected error (HTTP ${shouldEngageRes.status}).`);
            } 
            
            // Successful scenario
            else if(shouldEngageRes.status === 200){
                const shouldEngageData = await shouldEngageRes.json();

                if (typeof shouldEngageData !== 'object' || shouldEngageData === null || typeof shouldEngageData.shouldEngage !== 'boolean' || typeof shouldEngageData.reasoning !== 'string' || typeof shouldEngageData.fallback !== 'boolean') {
                    throw new Error("shouldEngage failed: received an unexpected response from the server. Please ensure you are using the correct version of the package.");
                }

                return shouldEngageData;
            }
            //#endregion
        } catch(error){
            if(error.message.includes("shouldEngage failed: ")){
                throw new Error(error.message);
            }
            
            throw new Error(
                "shouldEngage failed: an unexpected error occurred. " +
                "Please ensure you are using the correct version of the package. " +
                `Error details: ${error}`
            );
        }
    }
    //#endregion

    //#region Rewrite route
    async rewrite(content, instructions, useContext = true){
        //#region Validate arguments
        if (typeof content !== 'string' || content.trim().length === 0) {
            throw new Error("rewrite failed: content must be a non-empty string.");
        }

        if (content.length > MAX_MESSAGE_LENGTH) {
            throw new Error(`rewrite failed: content exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`);
        }
        if (typeof useContext !== 'boolean') {
            throw new Error("rewrite failed: useContext must be a boolean.");
        }

        if (instructions !== undefined) {
            if (typeof instructions !== 'string') {
                throw new Error('rewrite failed: instructions must be a string if provided.');
            }
            if (instructions.length > MAX_MESSAGE_LENGTH) {
                throw new Error(`rewrite failed: instructions exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH} characters.`);
            }
        }
        //#endregion

        try{
            //#region Fetch the API
            const rewriteRes = await fetch("https://heylock.dev/api/v1/rewrite", {
                method: 'POST',
                headers: {
                    'Authorization': this.agentKey
                },
                body: JSON.stringify({
                    text: content,
                    instructions: instructions,
                    context: useContext && this.getContextString()
                })
            });
            //#endregion

            //#region Setting rate limits
            const rateLimitRemainingHeader = rewriteRes.headers.get('x-ratelimit-remaining');
            const rateLimitRemaining = Number(rateLimitRemainingHeader);

            if(!isNaN(rateLimitRemaining) && rateLimitRemainingHeader !== null){
                this.#usageRemaining.rewrites = rateLimitRemaining;
            } else {
                this.#usageRemaining.rewrites--;
            }
            //#endregion

            //#region Handling scenarios based on HTTP codes
            if (rewriteRes.status === 400) {
                throw new Error("rewrite failed: invalid arguments. Please check your content, instructions or context.");
            } 
            
            else if (rewriteRes.status === 401) {
                throw new Error("rewrite failed: authorization failed. Please check your agent key and try again.");
            } 
            
            else if (rewriteRes.status === 429) {
                if (!isNaN(rateLimitRemaining) && rateLimitRemaining <= 0) {
                    throw new Error("rewrite failed: you have reached your rewrite plan limit. Please upgrade your plan or wait for the limit to reset.");
                } else {
                    throw new Error("rewrite failed: too many requests. Try again later.");
                }
            } 
            
            else if (rewriteRes.status === 500) {
                throw new Error("rewrite failed: we are experiencing server issues. Please try again later.");
            } 
            
            else if (rewriteRes.status === 502) {
                throw new Error("rewrite failed: external service error. Please try again later.");
            } 
            
            else if (rewriteRes.status !== 200) {
                throw new Error(`rewrite failed: unexpected error (HTTP ${rewriteRes.status}).`);
            } 
            
            // Successful scenario
            else if (rewriteRes.status === 200) {
                const rewriteData = await rewriteRes.json();
            
                // Validate response: must be an object { text: string }
                if (typeof rewriteData !== 'object' || rewriteData === null || typeof rewriteData.text !== 'string') {
                    throw new Error("rewrite failed: received an unexpected response from the server. Please ensure you are using the correct version of the package.");
                }
            
                return rewriteData.text;
            }
            //#endregion
        } catch(error){
            if(error.message.includes("rewrite failed: ")){
                throw new Error(error.message);
            }
            
            throw new Error(
                "rewrite failed: an unexpected error occurred. " +
                "Please ensure you are using the correct version of the package. " +
                `Error details: ${error}`
            );
        }
    }
    //#endregion

    //#region Sort route
    async sort(array, instructions, useContext = true){
        //#region Validate arguments
        if (!Array.isArray(array) || array.length < 2) {
            return {
                indexes: Array.isArray(array) ? array.map((item, index) => index) : [],
                warning: "Input array is invalid or too short to sort. Returning original array.",
                fallback: true
            };
        }

        if (instructions !== undefined) {
            if (typeof instructions !== 'string') {
                throw new Error("sort failed: instructions must be a string if provided.");
            }
        }

        if (typeof useContext !== 'boolean') {
            throw new Error("sort failed: useContext must be a boolean.");
        }
        //#endregion

        try{
            //#region Fetch the API
            const sortRes = await fetch('https://heylock.dev/api/v1/sort', {
                method: 'POST',
                headers: {
                    'Authorization': this.agentKey
                },
                body: JSON.stringify({
                    array: array,
                    instructions: instructions,
                    context: useContext && this.getContextString()
                })
            });
            //#endregion

            //#region Setting rate limits
            const rateLimitRemainingHeader = sortRes.headers.get('x-ratelimit-remaining');
            const rateLimitRemaining = Number(rateLimitRemainingHeader);

            if(!isNaN(rateLimitRemaining && rateLimitRemainingHeader !== null)){
                this.#usageRemaining.sorts = rateLimitRemaining;
            } else {
                this.#usageRemaining.sorts--;
            }
            //#endregion
        
            //#region Handling scenarios based on HTTP codes
            if (sortRes.status === 400) {
                throw new Error("sort failed: invalid arguments. Please check your array, instructions, and context.");
            } 
            
            else if (sortRes.status === 401) {
                throw new Error("sort failed: authorization failed. Please check your agent key and try again.");
            } 
            
            else if (sortRes.status === 429) {
                if (!isNaN(rateLimitRemaining) && rateLimitRemaining <= 0) {
                    throw new Error("sort failed: you have reached your sort plan limit. Please upgrade your plan or wait for the limit to reset.");
                } else {
                    throw new Error("sort failed: too many requests. Try again later.");
                }
            } 
            
            else if (sortRes.status === 500) {
                throw new Error("sort failed: we are experiencing server issues. Please try again later.");
            } 
            
            else if (sortRes.status === 502) {
                throw new Error("sort failed: external service error. Please try again later.");
            } 
            
            else if (sortRes.status !== 200) {
                throw new Error(`sort failed: unexpected error (HTTP ${sortRes.status}).`);
            } 
            
            // Successful scenario
            else if (sortRes.status === 200) {
                const sortData = await sortRes.json();

                if (typeof sortData !== 'object' || sortData === null || !Array.isArray(sortData.indexes) || sortData.indexes.some(idx => typeof idx !== 'number' || !Number.isInteger(idx)) || typeof sortData.reasoning !== 'string') {
                    throw new Error("sort failed: received an unexpected response from the server. Please ensure you are using the correct version of the package.");
                }

                // Edge case: indexes array length should match input array length
                if (sortData.indexes.length !== array.length) {
                    throw new Error("sort failed: response indexes length does not match input array length. Possible server bug or data corruption.");
                }

                // Create sorted array using indexes from the response
                const sortedArray = sortData.indexes.map(index => array[index]);

                return {
                    array: sortedArray,
                    indexes: sortData.indexes,
                    reasoning: sortData.reasoning,
                    fallback: typeof sortData.fallback === 'boolean' ? sortData.fallback : false
                };
            }
            //#endregion
        } catch(error){
            if(error.message.includes("sort failed: ")){
                throw new Error(error.message);
            }
            
            throw new Error(
                "sort failed: an unexpected error occurred. " +
                "Please ensure you are using the correct version of the package. " +
                `Error details: ${error}`
            );
        }
    }
    //#endregion
}