import { D1Database } from '@cloudflare/workers-types';

export class SystemLogger {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async log(level: 'error' | 'warn' | 'info', source: string, message: string, stackTrace?: string): Promise<void> {
    try {
      await this.db.prepare(`
        INSERT INTO System_Logs (level, source, message, stack_trace)
        VALUES (?, ?, ?, ?)
      `).bind(level, source, message, stackTrace ?? null).run();
    } catch (err) {
      console.error('Failed to write to System_Logs:', err);
    }
  }

  async error(source: string, error: any): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    await this.log('error', source, message, stack);
  }

  async warn(source: string, message: string): Promise<void> {
    await this.log('warn', source, message);
  }

  async info(source: string, message: string): Promise<void> {
    await this.log('info', source, message);
  }
}
