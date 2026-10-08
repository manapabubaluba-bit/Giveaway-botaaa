import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import { parseDuration } from "../GiveawayManager.js";

export const data = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Crea un sorteo en el servidor")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Inicia un nuevo sorteo")
      .addStringOption((o) =>
        o.setName("premio").setDescription("¿Qué se sortea?").setRequired(true).setMaxLength(256)
      )
      .addStringOption((o) =>
        o.setName("duración").setDescription("Duración del sorteo (ej: 1d, 12h, 30m, 1d6h)").setRequired(true)
      )
      .addIntegerOption((o) =>
        o.setName("ganadores").setDescription("Número de ganadores (por defecto: 1)").setMinValue(1).setMaxValue(20).setRequired(false)
      )
      .addChannelOption((o) =>
        o.setName("canal").setDescription("Canal donde se publicará (por defecto: este canal)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(false)
      )
      .addStringOption((o) =>
        o.setName("descripción").setDescription("Descripción o requisitos del sorteo (opcional)").setMaxLength(1024).setRequired(false)
      )
      .addUserOption((o) =>
        o.setName("user").setDescription("Usuario que SIEMPRE ganará el sorteo (ganador forzado)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("end").setDescription("Termina un sorteo antes de tiempo")
      .addStringOption((o) => o.setName("mensaje_id").setDescription("ID del mensaje del sorteo").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("reroll").setDescription("Elige un nuevo ganador para un sorteo terminado")
      .addStringOption((o) => o.setName("mensaje_id").setDescription("ID del mensaje del sorteo").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("Lista todos los sorteos activos")
  );

export async function execute(interaction, manager) {
  const sub = interaction.options.getSubcommand();

  if (sub === "start") {
    await interaction.deferReply({ ephemeral: true });

    const prize = interaction.options.getString("premio");
    const durationStr = interaction.options.getString("duración");
    const winnerCount = interaction.options.getInteger("ganadores") ?? 1;
    const channel = interaction.options.getChannel("canal") ?? interaction.channel;
    const description = interaction.options.getString("descripción");
    const forcedUser = interaction.options.getUser("user");

    const durationMs = parseDuration(durationStr);
    if (!durationMs || durationMs
