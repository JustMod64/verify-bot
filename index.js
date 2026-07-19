
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
 
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});
 
const setupState = new Map();
 
const CUSTOM_IDS = {
  COLOR_SELECT: 'verifybot_color_select',
  CHANNEL_SELECT: 'verifybot_channel_select',
  CONFIRM_BUTTON: 'verifybot_confirm',
  VERIFY_BUTTON: 'verifybot_verify',
  VERIFY_MODAL: 'verifybot_verify_modal',
  TEXT1_INPUT: 'verifybot_text1',
  TEXT2_INPUT: 'verifybot_text2',
  DELETE_DM_BUTTON: 'verifybot_delete_dm',
  APPROVE_BUTTON: 'verifybot_approve',
};
 
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});
 
client.on('interactionCreate', async (interaction) => {
  try {
    // === SETUP COMMANDS ===
    if (interaction.isChatInputCommand() && interaction.commandName === 'start') {
      setupState.set(interaction.user.id, {});
      await interaction.reply({
        content: buildStatusText({}),
        components: buildSetupComponents({}),
        ephemeral: true,
      });
      return;
    }
 
    if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
      const state = setupState.get(interaction.user.id) ?? {};
      if (interaction.customId === CUSTOM_IDS.COLOR_SELECT) state.color = interaction.values[0];
      if (interaction.customId === CUSTOM_IDS.CHANNEL_SELECT) state.channelId = interaction.values[0];
      setupState.set(interaction.user.id, state);
 
      await interaction.update({
        content: buildStatusText(state),
        components: buildSetupComponents(state),
      });
      return;
    }
 
    if (interaction.isButton() && interaction.customId === CUSTOM_IDS.CONFIRM_BUTTON) {
      const state = setupState.get(interaction.user.id);
      if (!state?.color || !state?.channelId) {
        return interaction.reply({ content: 'Select both options first.', ephemeral: true });
      }
 
      const channel = await interaction.guild.channels.fetch(state.channelId);
      if (!channel) return interaction.reply({ content: 'Channel not found.', ephemeral: true });
 
      const btn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.VERIFY_BUTTON)
        .setLabel('VERIFY')
        .setStyle(state.color === 'green' ? ButtonStyle.Success : ButtonStyle.Primary);
 
      await channel.send({
        content: 'Click below to verify:',
        components: [new ActionRowBuilder().addComponents(btn)],
      });
 
      await interaction.update({ content: '✅ Button posted!', components: [] });
      setupState.delete(interaction.user.id);
      return;
    }
 
    // === VERIFY MODAL ===
    if (interaction.isButton() && interaction.customId === CUSTOM_IDS.VERIFY_BUTTON) {
      const modal = new ModalBuilder()
        .setCustomId(CUSTOM_IDS.VERIFY_MODAL)
        .setTitle('Verification');
 
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(CUSTOM_IDS.TEXT1_INPUT)
            .setLabel('Email')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(CUSTOM_IDS.TEXT2_INPUT)
            .setLabel('Username / Reason')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
 
      await interaction.showModal(modal);
      return;
    }
 
    if (interaction.isModalSubmit() && interaction.customId === CUSTOM_IDS.VERIFY_MODAL) {
      const email = interaction.fields.getTextInputValue(CUSTOM_IDS.TEXT1_INPUT);
      const reason = interaction.fields.getTextInputValue(CUSTOM_IDS.TEXT2_INPUT);
 
      if (process.env.OWNER_ID) {
        const owner = await client.users.fetch(process.env.OWNER_ID).catch(() => null);
        if (owner) {
          // Encode both guildId and userId into the customId so we can
          // resolve them later even though the Approve button lives in a DM
          // (where interaction.guild is null).
          const approve = new ButtonBuilder()
            .setCustomId(`${CUSTOM_IDS.APPROVE_BUTTON}:${interaction.guild.id}:${interaction.user.id}`)
            .setLabel('✅ VERIFY')
            .setStyle(ButtonStyle.Success);
          const del = new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.DELETE_DM_BUTTON)
            .setLabel('🗑 DELETE')
            .setStyle(ButtonStyle.Danger);
 
          await owner.send({
            content: `**Verification Request**\nFrom: <@${interaction.user.id}>\nGuild: ${interaction.guild.name}\nEmail: ${email}\nReason: ${reason}`,
            components: [new ActionRowBuilder().addComponents(approve, del)],
          });
        }
      }
 
      await interaction.reply({ content: '✅ Request sent to owner!', ephemeral: true });
      return;
    }
 
    // === APPROVE BUTTON ===
    if (interaction.isButton() && interaction.customId.startsWith(CUSTOM_IDS.APPROVE_BUTTON)) {
      await interaction.deferReply({ ephemeral: true });
 
      // customId format: "verifybot_approve:GUILD_ID:USER_ID"
      const [, guildId, userId] = interaction.customId.split(':');
 
      try {
        // Fetch the guild directly from the client — interaction.guild is
        // null here because this button is clicked inside a DM, not inside
        // the guild itself.
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          return interaction.editReply({ content: '❌ Could not find that server (bot may have been removed).' });
        }
 
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          return interaction.editReply({ content: '❌ That member is no longer in the server.' });
        }
 
        const role = guild.roles.cache.find((r) => r.name.toLowerCase() === 'verified');
        if (!role) {
          return interaction.editReply({ content: '❌ No role named "Verified" found!' });
        }
 
        if (!guild.members.me.permissions.has('ManageRoles')) {
          return interaction.editReply({ content: '❌ Bot needs "Manage Roles" permission!' });
        }
 
        await member.roles.add(role);
        await interaction.editReply({ content: `✅ Verified <@${userId}> in **${guild.name}**` });
      } catch (e) {
        console.error(e);
        await interaction.editReply({ content: `❌ Error: ${e.message}` });
      }
      return;
    }
 
    // === DELETE BUTTON ===
    if (interaction.isButton() && interaction.customId === CUSTOM_IDS.DELETE_DM_BUTTON) {
      await interaction.deferUpdate();
      await interaction.message.delete().catch(() => {});
      return;
    }
  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Error occurred.', ephemeral: true }).catch(() => {});
    }
  }
});
 
function buildSetupComponents(state) {
  const colorSelect = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.COLOR_SELECT)
    .setPlaceholder('Choose button color')
    .addOptions([
      {
        label: 'Green',
        value: 'green',
        default: state.color === 'green',
      },
      {
        label: 'Blurple',
        value: 'blurple',
        default: state.color === 'blurple',
      },
    ]);
 
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(CUSTOM_IDS.CHANNEL_SELECT)
    .setPlaceholder('Choose a channel')
    .setChannelTypes(ChannelType.GuildText);
 
  const confirmButton = new ButtonBuilder()
    .setCustomId(CUSTOM_IDS.CONFIRM_BUTTON)
    .setLabel('Confirm & Post')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!state.color || !state.channelId);
 
  return [
    new ActionRowBuilder().addComponents(colorSelect),
    new ActionRowBuilder().addComponents(channelSelect),
    new ActionRowBuilder().addComponents(confirmButton),
  ];
}
 
function buildStatusText(state) {
  const color = state.color ? `**${state.color}**` : '*not set*';
  const channel = state.channelId ? `<#${state.channelId}>` : '*not set*';
  return `Set up the VERIFY button:\nColor: ${color}\nChannel: ${channel}`;
}
 
console.log("Token loaded:", !!process.env.DISCORD_TOKEN);
console.log("Token length:", process.env.DISCORD_TOKEN?.length);

client.login(process.env.DISCORD_TOKEN);