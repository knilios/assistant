const { ChromaClient, CloudClient } = require('chromadb');
const OpenAI = require('openai');
const config = require('../config/config');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

let chromaClient = null;
let collection = null;
let openai = null;

/**
 * Initialize Vector DB
 */
async function initializeVectorDB() {
  if (collection) {
    return collection;
  }

  try {
    // Initialize OpenAI for embeddings
    if (!openai) {
      openai = new OpenAI({
        apiKey: config.openai.apiKey,
      });
    }

    // Initialize Chroma
    const chromaUrl = new URL(config.vectorDB.path);
    
    if (chromaUrl.protocol === 'https:' && chromaUrl.hostname === 'api.trychroma.com') {
      // Use CloudClient for Chroma Cloud
      logger.info(`Connecting to Chroma Cloud (tenant: ${config.vectorDB.tenant})`);
      chromaClient = new CloudClient({
        apiKey: config.vectorDB.apiKey,
        tenant: config.vectorDB.tenant,
        database: config.vectorDB.database || 'default_database',
      });
    } else if (chromaUrl.protocol === 'https:') {
      // Generic cloud/hosted Chroma configuration
      chromaClient = new ChromaClient({
        host: chromaUrl.hostname,
        port: chromaUrl.port || 443,
        ssl: true,
        headers: config.vectorDB.apiKey ? {
          'Authorization': `Bearer ${config.vectorDB.apiKey}`,
          'x-chroma-token': config.vectorDB.apiKey,
        } : undefined,
        tenant: config.vectorDB.tenant,
        database: config.vectorDB.database,
      });
    } else {
      // Local Chroma configuration
      chromaClient = new ChromaClient({
        path: config.vectorDB.path,
      });
    }

    // Test connection
    const heartbeat = await chromaClient.heartbeat();
    logger.success('ChromaDB connection successful', heartbeat);

    // List available collections for debugging
    try {
      const collections = await chromaClient.listCollections();
      logger.info(`Available collections: ${collections.map(c => c.name).join(', ') || 'none'}`);
    } catch (listError) {
      logger.warn('Could not list collections (this is normal for Chroma Cloud with limited API keys)');
    }

    // We handle embeddings ourselves with OpenAI, so don't specify embedding function
    // Try to get existing collection first (cloud providers often require pre-creation)
    logger.info(`Attempting to access collection: ${config.vectorDB.collectionName}`);
    
    try {
      collection = await chromaClient.getCollection({
        name: config.vectorDB.collectionName,
      });
      logger.success(`✓ Vector DB collection connected: ${config.vectorDB.collectionName}`);
    } catch (getError) {
      logger.error(`✗ Cannot access collection '${config.vectorDB.collectionName}':`, getError.message);
      
      // Provide specific guidance based on the error
      if (getError.message && getError.message.includes('permission')) {
        logger.warn('');
        logger.warn('╔════════════════════════════════════════════════════════════════╗');
        logger.warn('║  CHROMA CLOUD SETUP REQUIRED                                   ║');
        logger.warn('╠════════════════════════════════════════════════════════════════╣');
        logger.warn('║  1. Go to: https://app.trychroma.com                           ║');
        logger.warn('║  2. Log in to your account                                     ║');
        logger.warn(`║  3. Create a collection named: "${config.vectorDB.collectionName.padEnd(36)}" ║`);
        logger.warn('║  4. Make sure your API key has access to this collection      ║');
        logger.warn('╚════════════════════════════════════════════════════════════════╝');
        logger.warn('');
      }
      
      throw getError;
    }

    logger.success(`Vector DB collection initialized: ${config.vectorDB.collectionName}`);
    return collection;
  } catch (error) {
    logger.error('Failed to initialize Vector DB:', error);
    if (error.message && error.message.includes('permission')) {
      logger.warn('Permission error: You may need to create the collection in your ChromaDB cloud dashboard first.');
      logger.warn(`Collection name: ${config.vectorDB.collectionName}`);
    } else {
      logger.warn('Make sure ChromaDB is running: docker run -d -p 8000:8000 chromadb/chroma');
    }
    return null;
  }
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    logger.error('Error generating embedding:', error.message);
    throw error;
  }
}

/**
 * Search for relevant memories
 */
async function searchMemories(query, limit = 3) {
  try {
    if (!collection) {
      await initializeVectorDB();
    }
    if (!collection) {
      return [];
    }

    const queryEmbedding = await generateEmbedding(query);
    
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
    });

    if (!results.documents[0] || results.documents[0].length === 0) {
      return [];
    }

    return results.documents[0].map((doc, idx) => ({
      narrative: doc,
      metadata: results.metadatas[0][idx],
      distance: results.distances[0][idx]
    }));
  } catch (error) {
    logger.error('Error searching memories:', error);
    return [];
  }
}

/**
 * Check for duplicate facts using semantic similarity
 */
async function checkDuplicate(factText, threshold = 0.15) {
  try {
    if (!collection) {
      await initializeVectorDB();
    }
    if (!collection) {
      return { isDuplicate: false };
    }

    const embedding = await generateEmbedding(factText);
    
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: 1
    });

    if (results.distances[0] && results.distances[0][0] < threshold) {
      return {
        isDuplicate: true,
        existingId: results.ids[0][0],
        existingText: results.documents[0][0],
        similarity: results.distances[0][0]
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    logger.error('Error checking duplicate:', error);
    return { isDuplicate: false };
  }
}

/**
 * Enrich existing fact with new information
 */
async function enrichExistingFact(factId, newText, newMessageId, newTimestamp) {
  try {
    if (!collection) return;

    // Get existing metadata
    const existing = await collection.get({ ids: [factId] });
    const existingMetadata = existing.metadatas[0] || {};
    
    const sourceMessages = existingMetadata.source_messages 
      ? existingMetadata.source_messages + ',' + newMessageId
      : newMessageId;

    await collection.update({
      ids: [factId],
      metadatas: [{
        ...existingMetadata,
        last_updated: newTimestamp,
        source_messages: sourceMessages,
        enriched: true
      }]
    });

    logger.info(`Enriched existing fact: ${factId}`);
  } catch (error) {
    logger.error('Error enriching fact:', error);
  }
}

/**
 * Store fact safely with deduplication
 */
async function storeFactSafely(factText, messageId, timestamp, category = 'fact') {
  try {
    if (!collection) {
      await initializeVectorDB();
    }
    if (!collection) {
      return { stored: 'failed', reason: 'no collection' };
    }

    // Check for duplicates
    const duplicate = await checkDuplicate(factText, config.memory.dedupThreshold);
    
    if (duplicate.isDuplicate) {
      await enrichExistingFact(duplicate.existingId, factText, messageId, timestamp.toISOString());
      return { stored: 'enriched', id: duplicate.existingId };
    }

    // Store new fact
    const embedding = await generateEmbedding(factText);
    const id = uuidv4();

    await collection.add({
      ids: [id],
      documents: [factText],
      embeddings: [embedding],
      metadatas: [{
        source_message_id: messageId,
        timestamp: timestamp.toISOString(),
        category: category,
        processed_type: 'immediate',
        source_messages: messageId
      }]
    });

    logger.info(`Stored new fact: ${factText.substring(0, 50)}...`);
    return { stored: 'new', id };
  } catch (error) {
    logger.error('Error storing fact:', error);
    return { stored: 'failed', reason: error.message };
  }
}

/**
 * Store memory chunk (batch processing)
 */
async function storeMemory(narrative, metadata = {}) {
  try {
    if (!collection) {
      await initializeVectorDB();
    }
    if (!collection) {
      return;
    }

    const embedding = await generateEmbedding(narrative);
    const id = uuidv4();

    await collection.add({
      ids: [id],
      documents: [narrative],
      embeddings: [embedding],
      metadatas: [{
        ...metadata,
        timestamp: new Date().toISOString(),
        processed_type: 'batch'
      }]
    });

    logger.debug(`Stored memory chunk: ${narrative.substring(0, 50)}...`);
  } catch (error) {
    logger.error('Error storing memory:', error);
  }
}

module.exports = {
  initializeVectorDB,
  generateEmbedding,
  searchMemories,
  checkDuplicate,
  enrichExistingFact,
  storeFactSafely,
  storeMemory
};
