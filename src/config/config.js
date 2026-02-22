require('dotenv').config();

module.exports = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    prefix: process.env.PREFIX || '!',
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  
  vectorDB: {
    path: process.env.CHROMA_PATH || 'http://localhost:8000',
    collectionName: process.env.CHROMA_COLLECTION || 'assistant_memories',
  },
  
  memory: {
    importanceThreshold: parseFloat(process.env.IMPORTANCE_THRESHOLD) || 0.7,
    dedupThreshold: parseFloat(process.env.DEDUP_SIMILARITY_THRESHOLD) || 0.15,
    contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE) || 10,
    batchSchedule: '0 23 * * *', // 11 PM daily
  }
};
