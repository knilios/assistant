const { getTodos, addTodo, completeTodo, deleteTodo } = require('../modules/sqlDB');

module.exports = {
  name: 'todo',
  aliases: ['task', 't'],
  description: 'Manage your todo list',
  usage: '!todo [add|list|done|delete] [task]',
  execute: async (message, args) => {
    const subcommand = args[0]?.toLowerCase();

    try {
      switch (subcommand) {
        case 'add':
          const task = args.slice(1).join(' ');
          if (!task) return message.reply('Please specify a task!');
          await addTodo(task, null, 'normal');
          return message.reply(`✅ Added: ${task}`);

        case 'list':
        case 'show':
          const todos = await getTodos(false);
          if (todos.length === 0) {
            return message.reply('No pending todos! 🎉');
          }
          const list = todos.map((t, i) => 
            `${i + 1}. ${t.task}${t.dueDate ? ` (due: ${t.dueDate})` : ''}`
          ).join('\n');
          return message.reply(`📝 **Your todos:**\n${list}`);

        case 'done':
        case 'complete':
          const todoIndex = parseInt(args[1]);
          if (!todoIndex || todoIndex < 1) {
            return message.reply('Please specify a valid todo number!');
          }
          const allTodos = await getTodos(false);
          if (todoIndex > allTodos.length) {
            return message.reply(`Todo #${todoIndex} doesn't exist!`);
          }
          const todoToComplete = allTodos[todoIndex - 1];
          await completeTodo(todoToComplete.id);
          return message.reply(`✅ Completed: ${todoToComplete.task}`);

        case 'delete':
        case 'remove':
          const deleteIndex = parseInt(args[1]);
          if (!deleteIndex || deleteIndex < 1) {
            return message.reply('Please specify a valid todo number!');
          }
          const todosToDelete = await getTodos(false);
          if (deleteIndex > todosToDelete.length) {
            return message.reply(`Todo #${deleteIndex} doesn't exist!`);
          }
          const todoToDelete = todosToDelete[deleteIndex - 1];
          await deleteTodo(todoToDelete.id);
          return message.reply(`🗑️ Deleted: ${todoToDelete.task}`);

        default:
          return message.reply('Usage: `!todo [add|list|done|delete] [task]`\n\nExamples:\n`!todo add Buy groceries`\n`!todo list`\n`!todo done 1`\n`!todo delete 2`');
      }
    } catch (error) {
      console.error('Error in todo command:', error);
      return message.reply('An error occurred while managing your todos.');
    }
  }
};
