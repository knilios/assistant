const OpenAI = require('openai');
const config = require('../config/config');
const logger = require('../utils/logger');
const { searchMemories } = require('./vectorDB');
const { storeFactSafely } = require('./vectorDB');
const { detectImportance, extractWithContext, reformulateQuery } = require('./memoryProcessor');
const { addEvent, addTodo, getTodos, completeTodo, deleteTodo, getRecentEvents, markMessageProcessed } = require('./sqlDB');

let openai = null;
let conversation_cache = [];

/**
 * Initialize OpenAI
 */
function initializeOpenAI() {
  if (!config.openai.apiKey) {
    logger.warn('OpenAI API key not configured');
    return null;
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    logger.success('OpenAI initialized successfully');
  }

  return openai;
}

/**
 * Define tools/functions for the AI to use
 */
const tools = [
  {
    type: 'function',
    function: {
      name: 'add_todo',
      description: 'Add a new task to the todo list',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The task description'
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high'],
            description: 'Task priority level'
          }
        },
        required: ['task']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_todos',
      description: 'Get all pending todos from the todo list',
      parameters: {
        type: 'object',
        properties: {
          include_completed: {
            type: 'boolean',
            description: 'Whether to include completed todos'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_todo',
      description: 'Mark a todo as completed',
      parameters: {
        type: 'object',
        properties: {
          task_description: {
            type: 'string',
            description: 'Description or partial match of the task to complete'
          }
        },
        required: ['task_description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: 'Delete a todo from the list',
      parameters: {
        type: 'object',
        properties: {
          task_description: {
            type: 'string',
            description: 'Description or partial match of the task to delete'
          }
        },
        required: ['task_description']
      }
    }
  }
];

/**
 * Execute tool calls
 */
async function executeToolCall(toolCall) {
  const functionName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  logger.info(`Executing tool: ${functionName}`, args);

  try {
    switch (functionName) {
      case 'add_todo':
        const newTodo = await addTodo(args.task, null, args.priority || 'normal');
        return { success: true, message: `Added todo: ${args.task}`, todo: newTodo };

      case 'get_todos':
        const todos = await getTodos(args.include_completed || false);
        return { 
          success: true, 
          todos: todos.map((t, i) => ({
            number: i + 1,
            task: t.task,
            priority: t.priority,
            completed: t.completed,
            dueDate: t.dueDate
          }))
        };

      case 'complete_todo':
        const allTodos = await getTodos(false);
        const todoToComplete = allTodos.find(t => 
          t.task.toLowerCase().includes(args.task_description.toLowerCase())
        );
        
        if (!todoToComplete) {
          return { success: false, message: `No todo found matching: ${args.task_description}` };
        }
        
        await completeTodo(todoToComplete.id);
        return { success: true, message: `Completed: ${todoToComplete.task}` };

      case 'delete_todo':
        const todosToSearch = await getTodos(false);
        const todoToDelete = todosToSearch.find(t => 
          t.task.toLowerCase().includes(args.task_description.toLowerCase())
        );
        
        if (!todoToDelete) {
          return { success: false, message: `No todo found matching: ${args.task_description}` };
        }
        
        await deleteTodo(todoToDelete.id);
        return { success: true, message: `Deleted: ${todoToDelete.task}` };

      default:
        return { success: false, message: `Unknown function: ${functionName}` };
    }
  } catch (error) {
    logger.error(`Error executing ${functionName}:`, error);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Handle AI chat interaction
 */
async function handleAIChat(message, client) {
  const ai = initializeOpenAI();
  
  if (!ai) {
    return message.channel.send('AI chat is not configured. Please set up your OpenAI API key.');
  }

  try {
    // Remove mention from message
    let input = message.content.replace(/<@!?\d+>/g, '').trim();
    
    if (!input || input === "") {
      return message.channel.send('What can I help you with?');
    }

    // Add to conversation cache
    const userMessage = {
      role: 'user',
      content: `${message.author.username}: ${input}`,
      messageId: message.id,
      timestamp: new Date()
    };
    conversation_cache.push(userMessage);

    // Show typing
    message.channel.startTyping();

    // === IMMEDIATE STORAGE ===
    // Note: Todos are handled by AI function calling, not immediate storage
    const importance = await detectImportance(input, conversation_cache);
    
    if (importance.important && importance.category !== 'todo') {
      logger.info(`[Important] ${importance.reason}`);
      
      // Extract facts with context
      const facts = await extractWithContext(input, conversation_cache, message.id);
      
      // Store each fact (exclude todos - those are managed by AI tools)
      for (const fact of facts) {
        if (fact.category === 'fact') {
          await storeFactSafely(fact.text, message.id, new Date(), fact.category);
        } else if (fact.category === 'event') {
          await addEvent(new Date().toISOString(), fact.text, message.author.username, input);
        }
        // Todos are skipped here - AI function calling handles them better
      }
      
      // Mark as processed
      await markMessageProcessed(message.id, 'immediate', importance.category);
    }

    // === CONTEXT RETRIEVAL ===
    // Reformulate query
    const searchQuery = await reformulateQuery(input, conversation_cache);
    
    // Search vector DB
    const relevantMemories = await searchMemories(searchQuery, 3);
    
    // Get recent events (but don't get todos here - let AI fetch via tools)
    const recentEvents = await getRecentEvents(7);

    // === BUILD CONTEXT ===
    const messages = [
      {
        role: 'system',
        content: `You are a helpful and friendly AI assistant with access to todo management tools.

Your purpose:
1. Be genuinely helpful and supportive
2. Help manage todos, reminders, and events using available tools
3. Remember conversations and information accurately
4. Provide concise but thorough responses (this is Discord)

When the user mentions tasks, todos, or things to remember:
- Use add_todo to create tasks
- Use get_todos to check current tasks
- Use complete_todo to mark tasks as done
- Use delete_todo to remove tasks

Personality:
- Friendly and warm, occasionally playful
- Proactive in offering help
- Admits when you don't know something
- References past conversations naturally

Respond naturally and helpfully.`
      }
    ];

    // Add relevant memories
    if (relevantMemories.length > 0) {
      const memoryContext = relevantMemories.map(m => m.narrative).join(' | ');
      messages.push({
        role: 'system',
        content: `Relevant memories: ${memoryContext}`
      });
    }

    // Add recent events
    if (recentEvents.length > 0) {
      const eventsContext = recentEvents
        .map(e => `${e.date}: ${e.description}`)
        .join('; ');
      messages.push({
        role: 'system',
        content: `Recent events (last 7 days): ${eventsContext}`
      });
    }

    // Add conversation history
    const recentConvo = conversation_cache.slice(-10);
    messages.push(...recentConvo);

    // === GENERATE RESPONSE WITH TOOL SUPPORT ===
    let response = await ai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 500
    });

    let responseMessage = response.choices[0].message;

    // Handle tool calls
    while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Add assistant's response with tool calls to messages
      messages.push(responseMessage);

      // Execute each tool call
      for (const toolCall of responseMessage.tool_calls) {
        const toolResult = await executeToolCall(toolCall);
        
        // Add tool response to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult)
        });

        logger.info(`Tool result: ${JSON.stringify(toolResult)}`);
      }

      // Get next response from AI with tool results
      response = await ai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 500
      });

      responseMessage = response.choices[0].message;
    }

    const botReply = responseMessage.content;

    // Add bot response to cache
    conversation_cache.push({
      role: 'assistant',
      content: botReply
    });

    // Trim cache if too long
    if (conversation_cache.length > 50) {
      conversation_cache = conversation_cache.slice(-40);
    }

    message.channel.stopTyping();
    return message.channel.send(botReply);

  } catch (error) {
    message.channel.stopTyping();
    logger.error('Error in AI chat:', error);
    return message.channel.send('Sorry, I encountered an error. Please try again.');
  }
}

/**
 * Get conversation cache (for scheduler)
 */
function getConversationCache() {
  return conversation_cache;
}

/**
 * Clear conversation cache
 */
function clearConversationCache() {
  conversation_cache = [];
}

module.exports = {
  handleAIChat,
  getConversationCache,
  clearConversationCache
};
