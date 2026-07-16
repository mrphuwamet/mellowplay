import { SettingsRepository } from '../repositories/settingsRepository';

async function postEmbed(webhookUrl: string, title: string, details: Record<string, any>, color: number): Promise<void> {
  const fields = Object.entries(details).map(([name, value]) => ({
    name,
    value: String(value).slice(0, 1000) || '-',
    inline: String(value).length < 40,
  }));

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{ title, color, fields, timestamp: new Date().toISOString() }],
    }),
  });
}

// Ops alerting via Discord webhook — free, zero external account setup
// beyond creating the webhook itself (LINE Notify, the old free option, was
// shut down by LINE in 2025). No-ops silently if nothing is configured yet.
export async function sendAlert(db: D1Database, title: string, details: Record<string, any>): Promise<void> {
  try {
    const settingsRepo = new SettingsRepository(db);
    const webhookUrl = await settingsRepo.getOverridable('discord_webhook_url', '');
    if (!webhookUrl) return;
    await postEmbed(webhookUrl, `🚨 ${title}`, details, 0xef4444);
  } catch {
    // Alerting must never itself break the request that triggered it.
  }
}

// "Good news" activity feed (new member, new booking) — deliberately posted
// to a SEPARATE Discord channel/webhook (discord_notify_webhook_url) from
// sendAlert's error channel above, so staff can watch signups/bookings
// live without that channel getting drowned out by error noise, and vice
// versa. No-ops silently if this second webhook hasn't been configured.
export async function sendNotification(db: D1Database, title: string, details: Record<string, any>): Promise<void> {
  try {
    const settingsRepo = new SettingsRepository(db);
    const webhookUrl = await settingsRepo.getOverridable('discord_notify_webhook_url', '');
    if (!webhookUrl) return;
    await postEmbed(webhookUrl, `✨ ${title}`, details, 0x22c55e);
  } catch {
    // Notifications must never themselves break the request that triggered them.
  }
}
