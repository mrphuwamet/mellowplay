-- Full API call logging (method/path/status/timing/caller/body), kept for a
-- maximum of 30 days — see the scheduled() cron handler in src/index.ts for
-- the automatic cleanup, and adminController.clearApiCallLogs for the manual
-- "delete now" button in the CRM. Bodies are masked (see src/utils/logMasking.ts)
-- before being written, never stored raw.
CREATE TABLE Api_Call_Logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  caller_type TEXT, -- 'admin' | 'consumer' | 'guest'
  caller_id INTEGER,
  ip TEXT,
  request_body TEXT,
  response_body TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_call_logs_created_at ON Api_Call_Logs(created_at);
