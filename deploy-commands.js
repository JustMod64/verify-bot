require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Set up the VERIFY button (choose color + channel)')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash command(s)...');

    // Guild-scoped registration: shows up instantly, good for testing.
    // Switch to Routes.applicationCommands(CLIENT_ID) for a global command
    // (takes up to ~1 hour to propagate) once you're ready to deploy everywhere.
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('Slash command(s) registered successfully.');
  } catch (error) {
    console.error(error);
  }
})();
