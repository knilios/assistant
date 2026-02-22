# Personal Assistant Discord Bot

A Discord bot with AI capabilities, memory management, and todo list functionality.

## Features

✅ **AI Assistant** - Natural conversation with GPT-4o
✅ **Smart Memory** - Dual database system (ChromaDB + SQLite)
✅ **Todo Management** - Natural language todo creation and management
✅ **Event Tracking** - Automatic event detection and storage
✅ **Daily Consolidation** - Batch processing at 11 PM

## Setup

### 1. Configure Environment Variables

Edit [.env](.env) and add your credentials:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id
OPENAI_API_KEY=your_openai_api_key
```

### 2. Start ChromaDB

ChromaDB is required for vector memory storage:

```bash
docker run -d -p 8000:8000 chromadb/chroma
```

### 3. Start the Bot

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## Commands

- `!help` - List all commands
- `!ping` - Check bot latency
- `!todo add [task]` - Add a todo
- `!todo list` - Show all todos
- `!todo done [number]` - Complete a todo
- `!todo delete [number]` - Delete a todo

## AI Chat

Mention the bot to chat with it:

```
@bot remind me to buy milk
@bot what are my tasks?
@bot I finished the groceries
```

The bot will:
- Remember important information
- Manage todos naturally
- Track events and dates
- Learn your preferences over time

## Database Management

View your database in a GUI:

```bash
npm run db:studio
```

This opens Prisma Studio at http://localhost:5555

## Project Structure

```
assistant-bot/
├── src/
│   ├── commands/      # Bot commands
│   ├── events/        # Discord event handlers
│   ├── handlers/      # Command & event loaders
│   ├── modules/       # Core functionality
│   │   ├── aiChat.js  # AI conversation
│   │   ├── vectorDB.js # ChromaDB operations
│   │   ├── sqlDB.js   # Prisma database
│   │   └── memoryProcessor.js # Memory extraction
│   ├── utils/         # Utilities
│   └── config/        # Configuration
├── data/              # SQLite database
├── prisma/            # Prisma schema & migrations
└── index.js           # Entry point
```

## Architecture

### Dual Database System

**Vector DB (ChromaDB)** - Time-irrelevant knowledge
- User preferences
- Relationships
- Skills and traits

**Relational DB (SQLite + Prisma)** - Time-relevant data
- Events with dates
- Todos and reminders
- Processed message tracking

### Memory Processing

**Immediate Storage**
- AI detects important information
- Stores facts and events right away
- Prevents duplicates with semantic search

**Batch Processing (11 PM Daily)**
- Consolidates remaining conversations
- Extracts and categorizes memories
- Clears conversation cache

## Troubleshooting

**Bot won't start**
- Check your Discord token in [.env](.env)
- Ensure all dependencies are installed

**ChromaDB errors**
- Make sure ChromaDB is running: `docker ps`
- Check the CHROMA_PATH in [.env](.env)

**Database errors**
- Try regenerating Prisma client: `npx prisma generate`
- Check DATABASE_URL in [.env](.env)

## License

ISC
