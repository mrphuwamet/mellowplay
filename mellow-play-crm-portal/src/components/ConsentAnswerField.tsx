import React, { useEffect, useState } from 'react';
import { Box, Checkbox, Chip, FormControlLabel, Link, Stack, Typography } from '@mui/material';
import axios from 'axios';
import { API_URL } from '../config';

/**
 * A PDPA consent answer, on a staff screen.
 *
 * Two jobs, and they pull in opposite directions.
 *
 * Taking a booking over the phone is a real case: the parent agrees, staff
 * tick it, and the version they agreed to has to be recorded exactly as the
 * app records it — otherwise a consent taken by phone is the one consent with
 * no evidence behind it.
 *
 * Editing a booking afterwards is not that case. Re-granting a consent on
 * someone's behalf, weeks later, from a screen they will never see, is
 * fabricating it. So `canGrant` is off there: staff can withdraw, because
 * withdrawal is the family's right and has to be actionable, and cannot
 * re-tick.
 */

interface ConsentDoc { id: number; doc_key: string; title: string; summary: string; version: number }

export interface ConsentRecord {
  docKey: string;
  documentId: number;
  version: number;
  acceptedAt: string;
}

interface Props {
  label: string;
  docKey: string;
  /** The plain answer — agreed when non-empty. */
  value: any;
  /** The companion `${field_key}__consent` value, as stored. */
  recordJson?: any;
  /** Whether ticking is allowed here at all. See the note above. */
  canGrant?: boolean;
  onChange: (value: string, record: ConsentRecord | null) => void;
}

const ConsentAnswerField: React.FC<Props> = ({ label, docKey, value, recordJson, canGrant = false, onChange }) => {
  const [doc, setDoc] = useState<ConsentDoc | null>(null);
  const agreed = !!value && String(value).trim() !== '';

  useEffect(() => {
    if (!docKey) return;
    let cancelled = false;
    axios.get(`${API_URL}/api/v1/consent-documents/key/${encodeURIComponent(docKey)}`)
      .then(res => { if (!cancelled && res.data?.success) setDoc(res.data.document); })
      .catch(() => { /* the row still shows the recorded answer without it */ });
    return () => { cancelled = true; };
  }, [docKey]);

  let record: ConsentRecord | null = null;
  try {
    record = recordJson ? (typeof recordJson === 'string' ? JSON.parse(recordJson) : recordJson) : null;
  } catch { /* an unreadable record must not hide the answer itself */ }

  const toggle = (next: boolean) => {
    if (next) {
      if (!canGrant || !doc) return;
      onChange('ยินยอม', {
        docKey: doc.doc_key,
        documentId: doc.id,
        version: doc.version,
        acceptedAt: new Date().toISOString(),
      });
    } else {
      onChange('', null);
    }
  };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>{label}</Typography>
        <Chip size="small" color={agreed ? 'success' : 'default'}
          label={agreed ? 'ยินยอมแล้ว' : 'ยังไม่ยินยอม'} sx={{ fontWeight: 700 }} />
        {/* The version recorded at the time, not today's — that is the whole
            point of keeping the archive. */}
        {!!record?.version && <Chip size="small" variant="outlined" label={`ฉบับที่ ${record.version}`} sx={{ fontWeight: 700 }} />}
      </Stack>

      {!!doc?.summary && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {doc.summary}
        </Typography>
      )}
      {!!record?.acceptedAt && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
          ยินยอมเมื่อ {new Date(record.acceptedAt).toLocaleString('th-TH')}
        </Typography>
      )}

      <FormControlLabel
        sx={{ mt: 0.5 }}
        control={
          <Checkbox
            size="small"
            checked={agreed}
            // Ticking is the guarded direction. Unticking always works: a
            // family withdrawing consent must never be blocked by a UI.
            disabled={!agreed && (!canGrant || !doc)}
            onChange={e => toggle(e.target.checked)}
          />
        }
        label={
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {agreed
              ? 'ติ๊กออกเพื่อบันทึกการถอนความยินยอม'
              : canGrant
                ? 'ติ๊กเมื่อผู้ปกครองยินยอมด้วยวาจา (ระบบจะบันทึกฉบับที่และเวลา)'
                : 'ให้ความยินยอมย้อนหลังแทนผู้ปกครองไม่ได้ — ต้องให้ผู้ปกครองยินยอมผ่านฟอร์มเอง'}
          </Typography>
        }
      />

      {!!docKey && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
          <Link href={`${API_URL.replace(/\/$/, '')}/api/v1/consent-documents/key/${encodeURIComponent(docKey)}`}
            target="_blank" rel="noreferrer" sx={{ fontWeight: 700 }}>
            ดูข้อความฉบับปัจจุบัน
          </Link>
        </Typography>
      )}
    </Box>
  );
};

export default ConsentAnswerField;
