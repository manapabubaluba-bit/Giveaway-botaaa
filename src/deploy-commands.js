import "dotenv/config";
import { REST, Routes } from "discord.js";
import * as giveawayCmd from "./commands/giveaway.js";

const commands = [giveawayCmd.data.toJSON()];

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("📡 Registrando slash commands...");

    const useGuild = !!process.env.GUILD_ID;

    if (useGuild) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`✅ Commands registrados en guild ${process.env.GUILD_ID} (instantáneo)`);
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log("✅ Commands globales registrados (puede tardar ~1 hora en propagarse)");
    }
  } catch (err) {
    console.error("❌ Error registrando commands:", err);
  }
})();
