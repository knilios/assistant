const cron = require('node-cron');
const logger = require('./logger');
const { getConversationCache, clearConversationCache } = require('../modules/aiChat');
const { processConversations, categorizeMemories } = require('../modules/memoryProcessor');
const { storeMemory } = require('../modules/vectorDB');
const { addEvent, isMessageProcessed, markMessageProcessed } = require('../modules/sqlDB');

// Run daily at 11 PM
cron.schedule('0 23 * * *', async () => {
  logger.info('=== Starting daily memory consolidation ===');

  try {
    const conversationCache = getConversationCache();

    // Filter unprocessed messages
    const unprocessedMessages = [];
    for (const msg of conversationCache) {
      if (msg.messageId && !(await isMessageProcessed(msg.messageId))) {
        unprocessedMessages.push(msg);
      }
    }

    if (unprocessedMessages.length === 0) {
      logger.info('No unprocessed messages to consolidate');
      return;
    }

    logger.info(`Processing ${unprocessedMessages.length} unprocessed messages...`);

    // Process conversations
    const chunks = await processConversations(unprocessedMessages);

    if (chunks.length > 0) {
      logger.info(`Extracted ${chunks.length} memory chunks`);

      // Store each chunk
      for (const chunk of chunks) {
        await storeMemory(chunk.narrative, chunk.metadata);
      }

      // Mark messages as processed
      for (const msg of unprocessedMessages) {
        if (msg.messageId) {
          await markMessageProcessed(msg.messageId, 'batch', 'consolidated');
        }
      }

      logger.success(`Stored ${chunks.length} memory chunks`);
    }

    // Clear conversation cache
    clearConversationCache();
    logger.success('=== Daily memory consolidation complete ===');

  } catch (error) {
    logger.error('Error in daily consolidation:', error);
  }
});

logger.info('Scheduler initialized - Daily consolidation at 11 PM');
