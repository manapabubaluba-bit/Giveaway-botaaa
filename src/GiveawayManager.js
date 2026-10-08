import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "giveaways.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function parseDuration(str) {
  const regex = /(\d+)\s*(d|h|m|s)/gi;
  let total = 0;
  let match;
  const units = { d: 86400, h: 3600, m: 60, s: 1 };
  while ((match = regex.exec(str)) !== null) {
    total += parseInt(match[1]) * (units[match[2].toLowerCase()] ?? 0);
  }
  return total * 1000;
}

export function formatDuration(ms) {
  if (ms <= 0) return "Terminado";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec) parts.push(`${sec}s`);
  return parts.join(" ") || "< 1s";
}

function buildEmbed(giveaway, timeLeft) {
  const ended = timeLeft <= 0;
  const entries = giveaway.entries.length;

  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(ended ? 0x95a5a6 : 0xf1c40f)
    .addFields(
      {
        name: "⏰ Termina en",
        value: ended ? "**Terminado**" : `**${formatDuration(timeLeft)}**`,
        inline: true,
      },
      {
        name: "🏆 Ganadores",
        value: `**${giveaway.winnerCount}**`,
        inline: true,
      },
      {
        name: "🎟️ Participantes",
        value: `**${entries}**`,
        inline: true,
      },
      {
        name: "📅 Termina",
        value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>`,
        inline: true,
      },
      {
        name: "📣 Organizado por",
        value: `<@${giveaway.hostedBy}>`,
        inline: true,
      }
    )
    .setFooter({ text: `ID: ${giveaway.id}` })
    .setTimestamp(giveaway.endsAt);

  if (giveaway.description) {
    embed.setDescription(giveaway.description);
  }

  if (ended && giveaway.winners?.length) {
    embed.addFields({
      name: "🎊 Ganador(es)",
      value: giveaway.winners.map((id) => `<@${id}>`).join(", "),
    });
  }

  return embed;
}

function buildButton(entries = 0, ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_enter")
      .setLabel(ended ? "Terminado" : `🎉 Participar (${entries})`)
      .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(ended)
  );
}

export class GiveawayManager {
  constructor(client) {
    this.client = client;
    this.giveaways = loadData();
    this.timers = new Map();
  }

  async resumeAll() {
    const now = Date.now();
    for (const [msgId, giveaway] of Object.entries(this.giveaways)) {
      if (giveaway.ended) continue;
      const remaining = giveaway.endsAt - now;
      if (remaining <= 0) {
        await this._end(msgId);
      } else {
        this._scheduleEnd(msgId, remaining);
        this._startLiveTimer(msgId);
      }
    }
  }

  async create({ channel, prize, description, durationMs, winnerCount, hostedBy, forcedWinner }) {
    const endsAt = Date.now() + durationMs;
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();

    const embed = buildEmbed(
      { prize, description, entries: [], winnerCount, endsAt, hostedBy, forcedWinner, id },
      durationMs
    );
    const row = buildButton(0);

    const message = await channel.send({
      content: "🎉 **¡NUEVO SORTEO!** 🎉",
      embeds: [embed],
      components: [row],
    });

    const giveaway = {
      id,
      messageId: message.id,
      channelId: channel.id,
      guildId: channel.guild.id,
      prize,
      description: description || null,
      winnerCount,
      endsAt,
      hostedBy,
      forcedWinner: forcedWinner || null,
      entries: [],
      ended: false,
      winners: [],
    };

    this.giveaways[message.id] = giveaway;
    saveData(this.giveaways);

    this._scheduleEnd(message.id, durationMs);
    this._startLiveTimer(message.id);

    return giveaway;
  }

  async handleEntry(interaction) {
    const msgId = interaction.message.id;
    const giveaway = this.giveaways[msgId];

    if (!giveaway || giveaway.ended) {
      return interaction.reply({ content: "Este sorteo ya terminó.", ephemeral: true });
    }

    const userId = interaction.user.id;
    const idx = giveaway.entries.indexOf(userId);

    if (idx === -1) {
      giveaway.entries.push(userId);
      saveData(this.giveaways);
      await interaction.reply({
        content: "✅ ¡Te has apuntado al sorteo! Buena suerte 🍀",
        ephemeral: true,
      });
    } else {
      giveaway.entries.splice(idx, 1);
      saveData(this.giveaways);
      await interaction.reply({
        content: "❌ Has salido del sorteo.",
        ephemeral: true,
      });
    }

    await this._refreshMessage(msgId);
  }

  _startLiveTimer(msgId) {
    const interval = setInterval(async () => {
      const giveaway = this.giveaways[msgId];
      if (!giveaway || giveaway.ended) {
        clearInterval(interval);
        return;
      }
      await this._refreshMessage(msgId);
    }, 10_000);
    this.timers.set(`live_${msgId}`, interval);
  }

  async _refreshMessage(msgId) {
    const giveaway = this.giveaways[msgId];
    if (!giveaway) return;

    try {
      const channel = await this.client.channels.fetch(giveaway.channelId);
      const message = await channel.messages.fetch(msgId);
      const timeLeft = giveaway.endsAt - Date.now();
      const embed = buildEmbed(giveaway, timeLeft);
      const row = buildButton(giveaway.entries.length, giveaway.ended);
      await message.edit({ embeds: [embed], components: [row] });
    } catch {
      // ignore
    }
  }

  _scheduleEnd(msgId, delay) {
    const timeout = setTimeout(() => this._end(msgId), delay);
    this.timers.set(`end_${msgId}`, timeout);
  }

  async _end(msgId) {
    const giveaway = this.giveaways[msgId];
    if (!giveaway || giveaway.ended) return;

    clearTimeout(this.timers.get(`end_${msgId}`));
    clearInterval(this.timers.get(`live_${msgId}`));
    this.timers.delete(`end_${msgId}`);
    this.timers.delete(`live_${msgId}`);

    const winners = this._pickWinners(giveaway);

    giveaway.ended = true;
    giveaway.winners = winners;
    saveData(this.giveaways);

    await this._refreshMessage(msgId);

    try {
      const channel = await this.client.channels.fetch(giveaway.channelId);
      if (winners.length === 0) {
        await channel.send({
          content: `😔 El sorteo de **${giveaway.prize}** terminó pero no hubo suficientes participantes.`,
        });
      } else {
        const mention = winners.map((id) => `<@${id}>`).join(", ");
        await channel.send({
          content: `🎊 ¡Felicitaciones ${mention}! Ganaste **${giveaway.prize}**.\n> [Ver sorteo](https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${msgId})`,
        });
      }
    } catch {
      // Channel gone
    }
  }

  _pickWinners(giveaway) {
    const { entries, winnerCount, forcedWinner } = giveaway;

    if (forcedWinner) {
      const rest = entries.filter((id) => id !== forcedWinner);
      const extraSlots = Math.min(winnerCount - 1, rest.length);
      const extra = this._randomSample(rest, extraSlots);
      return [forcedWinner, ...extra];
    }

    return this._randomSample(entries, Math.min(winnerCount, entries.length));
  }

  _randomSample(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  async reroll(msgId) {
    const giveaway = this.giveaways[msgId];
    if (!giveaway || !giveaway.ended) return null;

    const newWinners = this._pickWinners(giveaway);
    giveaway.winners = newWinners;
    saveData(this.giveaways);
    await this._refreshMessage(msgId);
    return newWinners;
  }

  get(msgId) { return this.giveaways[msgId] || null; }
  getAll() { return Object.values(this.giveaways); }
        }
