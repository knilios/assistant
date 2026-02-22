const OpenAI = require('openai');
const config = require('../config/config');
const logger = require('../utils/logger');

let openai = null;

/**
 * Initialize OpenAI
 */
function initializeOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return openai;
}

/**
 * Detect if message contains important information
 */
async function detectImportance(message, conversationContext) {
  try {
    const ai = initializeOpenAI();
    const contextWindow = conversationContext.slice(-config.memory.contextWindowSize);

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: `Determine if this message contains important information worth storing immediately.

Important information includes:
- Tasks, todos, reminders
- Deadlines, appointments, scheduled events
- Important facts about the user (birthday, preferences, relationships)
- Critical decisions or commitments
- Information user explicitly asks to remember

NOT important:
- Casual chat, greetings
- Jokes, memes, sarcasm
- Hypothetical discussions
- General knowledge questions

Respond with JSON: {"important": boolean, "reason": string, "category": "fact|event|todo|reminder|none"}`
      }, {
        role: 'user',
        content: `Context:\n${contextWindow.map(m => m.content).join('\n')}\n\nCurrent message:\n${message}`
      }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    logger.error('Error detecting importance:', error);
    return { important: false, reason: 'error', category: 'none' };
  }
}

/**
 * Extract facts with conversation context
 */
async function extractWithContext(currentMessage, conversationCache, messageId) {
  try {
    const ai = initializeOpenAI();
    const contextWindow = conversationCache.slice(-config.memory.contextWindowSize);

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: `Extract important facts from this conversation snippet.

CRITICAL RULES:
1. ONLY extract information EXPLICITLY stated
2. Do NOT infer, assume, or create plausible facts
3. Do NOT extract jokes, sarcasm, or hypotheticals
4. Consider conversation context
5. If uncertain, DO NOT include it

Categorize each fact as:
- "fact" (time-irrelevant): preferences, attributes, relationships
- "event" (time-relevant): things that happened on specific dates
- "todo" (actionable): tasks to complete
- "reminder" (scheduled): future notifications

Return JSON: {"facts": [{"text": string, "category": string, "confidence": number}]}`
      }, {
        role: 'user',
        content: `Context:\n${contextWindow.map(m => m.content).join('\n')}\n\nCurrent message:\n${currentMessage}`
      }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result.facts || [];
  } catch (error) {
    logger.error('Error extracting facts:', error);
    return [];
  }
}

/**
 * Process conversations for batch storage
 */
async function processConversations(messages) {
  try {
    const ai = initializeOpenAI();

    if (!messages || messages.length === 0) {
      return [];
    }

    const conversationText = messages.map(m => m.content).join('\n');

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: `Extract important facts from these conversations.

STRICT RULES:
1. ONLY extract EXPLICITLY stated information
2. Do NOT infer or assume
3. Do NOT extract jokes or sarcasm
4. Each chunk must be self-contained and factual
5. Separate unrelated topics with |

Output only memory chunks separated by |.`
      }, {
        role: 'user',
        content: conversationText
      }],
      temperature: 0.1,
      max_tokens: 2000
    });

    const narrativeText = response.choices[0].message.content.trim();
    
    const chunks = narrativeText
      .split('|')
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 20)
      .map(chunk => ({
        narrative: chunk,
        metadata: {
          message_count: messages.length,
          created_at: new Date().toISOString()
        }
      }));

    return chunks;
  } catch (error) {
    logger.error('Error processing conversations:', error);
    return [];
  }
}

/**
 * Categorize into time-relevant vs time-irrelevant
 */
async function categorizeMemories(conversationText) {
  try {
    const ai = initializeOpenAI();

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: `Separate information into time-relevant and time-irrelevant categories.

Time-RELEVANT (SQL):
- Events on specific dates
- Scheduled future events, deadlines
- Time-based patterns

Time-IRRELEVANT (Vector DB):
- User preferences, likes/dislikes
- Personality traits
- Relationships, skills, interests

Return JSON: {
  "time_relevant": [{"text": string, "date": string, "type": "event|todo|pattern"}],
  "time_irrelevant": [{"text": string}]
}`
      }, {
        role: 'user',
        content: conversationText
      }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    logger.error('Error categorizing memories:', error);
    return { time_relevant: [], time_irrelevant: [] };
  }
}

/**
 * Reformulate query for better search
 */
async function reformulateQuery(query, conversationContext) {
  try {
    const ai = initializeOpenAI();
    const recentContext = conversationContext.slice(-3);

    if (recentContext.length === 0) {
      return query;
    }

    const response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: 'Reformulate the query to better search for relevant memories. Keep it concise. Return only the reformulated query, nothing else.'
      }, {
        role: 'user',
        content: `Context:\n${recentContext.map(m => m.content).join('\n')}\n\nQuery: ${query}`
      }],
      temperature: 0.3,
      max_tokens: 100
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    logger.warn('Error reformulating query:', error);
    return query;
  }
}

module.exports = {
  initializeOpenAI,
  detectImportance,
  extractWithContext,
  processConversations,
  categorizeMemories,
  reformulateQuery
};
