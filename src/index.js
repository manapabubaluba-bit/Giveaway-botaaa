import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { GiveawayManager } from "./GiveawayManager.js";
import * as giveawayCmd from "./commands/giveaway.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

const manager = new GiveawayManager(client);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online como ${c.user.tag}`);
  await manager.resumeAll();
  console.log("✅ Sorteos activos reanudados.");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "giveaway") {
      try {
        await giveawayCmd.execute(interaction, manager);
      } catch (err) {
        console.error("Error en /giveaway:", err);
        const reply = { content: "❌ Ocurrió un error interno.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "giveaway_enter") {
    try {
      await manager.handleEntry(interaction);
    } catch (err) {
      console.error("Error en botón de sorteo:", err);
      if (!interaction.replied) {
        await interaction.reply({
          content: "❌ Ocurrió un error. Intenta de nuevo.",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  }
});

client.login(process.env.TOKEN);
