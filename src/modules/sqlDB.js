const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Initialize Prisma (connection test)
 */
async function initializeSQL() {
  try {
    // Test connection
    await prisma.$connect();
    logger.success('Prisma database connected successfully');
    return prisma;
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

// === EVENTS ===
async function addEvent(date, description, participants = null, context = null) {
  try {
    const event = await prisma.event.create({
      data: {
        date,
        description,
        participants,
        context
      }
    });
    return event;
  } catch (error) {
    logger.error('Error adding event:', error);
    throw error;
  }
}

async function getRecentEvents(days = 7) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const events = await prisma.event.findMany({
      where: {
        date: {
          gte: cutoffDate.toISOString()
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    return events;
  } catch (error) {
    logger.error('Error getting recent events:', error);
    return [];
  }
}

async function searchEvents(query) {
  try {
    const events = await prisma.event.findMany({
      where: {
        OR: [
          { description: { contains: query } },
          { context: { contains: query } }
        ]
      },
      orderBy: {
        date: 'desc'
      },
      take: 10
    });
    return events;
  } catch (error) {
    logger.error('Error searching events:', error);
    return [];
  }
}

// === TODOS ===
async function addTodo(task, dueDate = null, priority = 'normal') {
  try {
    const todo = await prisma.todo.create({
      data: {
        task,
        dueDate,
        priority
      }
    });
    return todo;
  } catch (error) {
    logger.error('Error adding todo:', error);
    throw error;
  }
}

async function getTodos(includeCompleted = false) {
  try {
    const where = includeCompleted ? {} : { completed: false };
    
    const todos = await prisma.todo.findMany({
      where,
      orderBy: [
        { completed: 'asc' },
        { createdAt: 'desc' }
      ]
    });
    return todos;
  } catch (error) {
    logger.error('Error getting todos:', error);
    return [];
  }
}

async function completeTodo(id) {
  try {
    const todo = await prisma.todo.update({
      where: { id },
      data: { completed: true }
    });
    return todo;
  } catch (error) {
    logger.error('Error completing todo:', error);
    throw error;
  }
}

async function deleteTodo(id) {
  try {
    const todo = await prisma.todo.delete({
      where: { id }
    });
    return todo;
  } catch (error) {
    logger.error('Error deleting todo:', error);
    throw error;
  }
}

// === REMINDERS ===
async function addReminder(triggerTime, message, recurring = null) {
  try {
    const reminder = await prisma.reminder.create({
      data: {
        triggerTime,
        message,
        recurring
      }
    });
    return reminder;
  } catch (error) {
    logger.error('Error adding reminder:', error);
    throw error;
  }
}

async function getUpcomingReminders(hours = 24) {
  try {
    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);
    
    const reminders = await prisma.reminder.findMany({
      where: {
        triggerTime: {
          gte: now.toISOString(),
          lte: future.toISOString()
        },
        completed: false
      },
      orderBy: {
        triggerTime: 'asc'
      }
    });
    return reminders;
  } catch (error) {
    logger.error('Error getting upcoming reminders:', error);
    return [];
  }
}

async function completeReminder(id) {
  try {
    const reminder = await prisma.reminder.update({
      where: { id },
      data: { completed: true }
    });
    return reminder;
  } catch (error) {
    logger.error('Error completing reminder:', error);
    throw error;
  }
}

// === MESSAGE TRACKING ===
async function markMessageProcessed(messageId, processingType, storedIn = null) {
  try {
    const processed = await prisma.processedMessage.upsert({
      where: { messageId },
      update: { processingType, storedIn },
      create: { messageId, processingType, storedIn }
    });
    return processed;
  } catch (error) {
    logger.error('Error marking message processed:', error);
    throw error;
  }
}

async function isMessageProcessed(messageId) {
  try {
    const message = await prisma.processedMessage.findUnique({
      where: { messageId }
    });
    return message !== null;
  } catch (error) {
    logger.error('Error checking if message processed:', error);
    return false;
  }
}

async function getUnprocessedCount() {
  try {
    const count = await prisma.processedMessage.count();
    return count;
  } catch (error) {
    logger.error('Error getting unprocessed count:', error);
    return 0;
  }
}

// Cleanup on shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = {
  prisma,
  initializeSQL,
  addEvent,
  getRecentEvents,
  searchEvents,
  addTodo,
  getTodos,
  completeTodo,
  deleteTodo,
  addReminder,
  getUpcomingReminders,
  completeReminder,
  markMessageProcessed,
  isMessageProcessed,
  getUnprocessedCount
};
