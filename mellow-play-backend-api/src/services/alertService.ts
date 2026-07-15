import { SettingsRepository } from '../repositories/settingsRepository';

// Ops alerting via Discord webhook — free, zero external account setup
// beyond creating the webhook itself (LINE Notify, the old free option, was
// shut down by LINE in 2025). No-ops silently if nothing is configured yet.
export async function sendAlert(db: D1Database, title: string, details: Record<string, any>): Promise<void> {
  try {
    const settingsRepo = new SettingsRepository(db);
    const webhookUrl = await settingsRepo.getOverridable('discord_webhook_url', '');
    if (!webhookUrl) return;

    const fields = Object.entries(details).map(([name, value]) => ({
      name,
      value: String(value).slice(0, 1000) || '-',
      inline: String(value).length < 40,
    }));

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `🚨 ${title}`,
          color: 0xef4444,
          fields,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch {
    // Alerting must never itself break the request that triggered it.
  }
}
