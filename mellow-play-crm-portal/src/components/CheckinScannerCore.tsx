import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import {
  Box, Paper, Typography, Avatar, Chip, Button, Alert, CircularProgress,
  List, ListItem, ListItemText, Checkbox, Divider, Tabs, Tab, TextField, Stack,
} from '@mui/material';
import {
  QrCodeScanner as ScanIcon, CheckCircle as CheckIcon, Refresh as RescanIcon,
  Phone as PhoneIcon, ReportProblem as WarningIcon, EventBusy as AbsentIcon,
  EmojiEvents as MedalIcon,
} from '@mui/icons-material';
import { AxiosInstance } from 'axios';
import CheckinRoundPanel from './CheckinRoundPanel';
import BookingNoteBox from './BookingNoteBox';
import BookingAwardsDialog from './stamps/BookingAwardsDialog';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;
const SCANNER_ELEMENT_ID = 'qr-checkin-reader';

interface CheckinAction {
  id: number;
  label: string;
  sort_order: number;
  checked_at: string | null;
}

interface CheckinBooking {
  id: number;
  qr_token: string;
  course_name: string;
  is_event: boolean;
  is_service: boolean;
  scheduled_at: string;
  status: string;
  child_name?: string;
  child_name_en?: string;
  child_nickname?: string;
  child_avatar?: string;
  parent_first_name?: string;
  parent_last_name?: string;
  parent_phone?: string;
  form_submission_id?: number;
  staff_note?: string | null;
  actions: CheckinAction[];
  /** Staff-only, and absent for a first-time attendee. */
  no_show_history?: { missed: number; of: number } | null;
}

interface FormAnswerField {
  label: string; type: string; value: any;
  realName?: string; nickname?: string;
  /** Set on the field in the form builder — see config_json.showAtCheckin. */
  config_json?: string | null;
}

/**
 * Which answers are lifted out of the list.
 *
 * The card used to print every answer at the same weight, so a form with
 * twenty questions gave "แพ้นม" exactly the same appearance as "รู้จักเราจาก
 * ช่องทางไหน" — on a phone, with a family waiting. Whoever built the form marks
 * the few that matter, and those go to the top in a colour.
 */
const isPinned = (f: FormAnswerField): boolean => {
  try { return !!JSON.parse(f.config_json || '{}')?.showAtCheckin; } catch { return false; }
};

/** A pinned field with nothing in it is not a warning — it is a blank. */
const hasValue = (f: FormAnswerField): boolean => {
  const v = f.value;
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== '';
};

interface PhoneSearchResult {
  booking_id: number;
  qr_token: string;
  scheduled_at: string;
  status: string;
  course_name: string;
  child_name?: string;
  child_nickname?: string;
  child_avatar?: string;
}

// family_member_picker's plain `value` is just one display string
// (nickname-preferred) — show nickname + real name together when both are
// available and actually differ, so staff aren't stuck seeing only
// whichever one the family happened to have set as their display name.
function formatFormFieldValue(f: FormAnswerField): string {
  if (f.type === 'family_member_picker' && f.nickname && f.realName && f.nickname !== f.realName) {
    return `${f.nickname} (${f.realName})`;
  }
  return Array.isArray(f.value) ? f.value.join(', ') : (f.value ?? '-');
}

interface Props {
  // Injected so this same UI can run under the CRM's global axios (with its
  // interceptor-attached CRM JWT) or under a bare instance carrying a
  // checkin-access session token instead — see CheckinAccessScanner.tsx.
  client: AxiosInstance;
  // Called on a 401/403 from any of the calls below — the public
  // PIN-gated page uses this to drop back to the PIN screen.
  onUnauthorized?: () => void;
  /**
   * Whether this screen is running inside the CRM with a real staff session.
   *
   * False for the PIN-link page, which gates the three things a forwarded link
   * should not carry: closing a round off, the internal staff note, and
   * awarding medals. Everything a volunteer at a door actually needs — the
   * roster, the card, ticking people in — stays available either way.
   */
  canCloseRound?: boolean;
}

// Camera-based scanner (html5-qrcode) rather than a QR-encoded deep link —
// staff/volunteers point the device's own camera at the attendee's QR,
// decoded entirely client-side. The scanner pauses itself once a code is
// found so it doesn't immediately re-trigger on the same QR still in
// frame; "สแกนใหม่" resumes it for the next attendee. A manual phone-number
// mode covers the case where scanning isn't practical.
/**
 * Which lens to open.
 *
 * A phone offers several rear cameras and the browser's default is often the
 * ultra-wide, which puts the QR so far away that it will not resolve at arm's
 * length. Prefer a rear camera that is not ultra-wide; fall back to any rear
 * one, then to whatever exists — a laptop has only a front camera and should
 * still work.
 */
export function pickRearCamera(cameras: { id: string; label: string }[]): string {
  const rear = cameras.filter(c => /back|rear|environment|หลัง/i.test(c.label || ''));
  const pool = rear.length > 0 ? rear : cameras;
  const usable = pool.filter(c => !/ultra|wide-angle|ultrawide|มุมกว้าง/i.test(c.label || ''));
  return (usable[0] ?? pool[0] ?? cameras[0]).id;
}

/**
 * The token out of whatever was scanned.
 *
 * The QR image encodes the bare token, but the same code reaches this from an
 * email link (/checkin/<token>, possibly several joined by commas) and from a
 * handheld scanner pointed at either. Taking the last path segment and the
 * first token covers all of them without the caller having to know which it got.
 */
export function extractToken(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';
  const afterPath = text.includes('/checkin/') ? text.split('/checkin/').pop()! : text;
  return decodeURIComponent(afterPath.split(/[?#]/)[0].split(',')[0].trim());
}

const CheckinScannerCore: React.FC<Props> = ({ client, onUnauthorized, canCloseRound = false }) => {
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [booking, setBooking] = useState<CheckinBooking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingActionId, setTogglingActionId] = useState<number | null>(null);
  const [surveyHistory, setSurveyHistory] = useState<any[] | null>(null);
  // Folded by default. The pinned answers are the ones anyone needs while a
  // family is standing there; the other eighteen are for looking something up.
  const [allAnswersOpen, setAllAnswersOpen] = useState(false);
  // Bumped after every tick so the roster's counter follows along without the
  // panel having to poll for it.
  const [rosterKey, setRosterKey] = useState(0);
  const [awardsOpen, setAwardsOpen] = useState(false);
  // The card's own copy, so saving updates what is on screen without reloading
  // the booking out from under whoever is reading it.
  const [note, setNote] = useState<string | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSearchLoading, setPhoneSearchLoading] = useState(false);
  const [phoneResults, setPhoneResults] = useState<PhoneSearchResult[] | null>(null);
  const [formFields, setFormFields] = useState<FormAnswerField[] | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // Not an error. A desk machine has no camera, and saying "เปิดกล้องไม่ได้" to
  // someone who was never going to use one reads as a fault to be reported.
  const [noCamera, setNoCamera] = useState(false);
  const [starting, setStarting] = useState(true);
  // A hardware scanner is a keyboard: it types the code and presses Enter.
  // The field is kept focused whenever the camera view is on screen so a
  // handheld gun works without anyone clicking into anything first.
  const wedgeRef = useRef<HTMLInputElement | null>(null);
  const [wedgeValue, setWedgeValue] = useState('');
  const lastScannedRef = useRef<string | null>(null);

  const handleRequestError = (e: any, fallbackMessage: string) => {
    const status = e.response?.status;
    setError(e.response?.data?.message || fallbackMessage);
    if (status === 401 || status === 403) onUnauthorized?.();
  };

  const lookupToken = async (token: string, force = false) => {
    // The repeat guard is for a code sitting in front of the lens, not for a
    // deliberate second tap on the same name.
    if (force) lastScannedRef.current = null;
    if (token === lastScannedRef.current) return; // same code still in frame
    lastScannedRef.current = token;
    pauseCamera();
    setLoading(true);
    setError(null);
    try {
      const res = await client.get(`${API_BASE}/checkin/lookup/${encodeURIComponent(token)}`);
      if (res.data.success) { setBooking(res.data.booking); setNote(res.data.booking?.staff_note ?? null); }
    } catch (e: any) {
      handleRequestError(e, 'ไม่พบข้อมูลการจองสำหรับ QR นี้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, false);
    scannerRef.current = scanner;

    (async () => {
      try {
        // Asking for the list is itself the permission prompt, which is why
        // there is no button to press first — someone working a door has a
        // queue in front of them.
        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) return;
        // No camera at all — a desk machine. Say so and stop, rather than
        // asking to start one anyway and reporting the failure as a fault.
        if (cameras.length === 0) {
          setNoCamera(true);
          return;
        }
        const constraint = { deviceId: { exact: pickRearCamera(cameras) } };
        await scanner.start(
          constraint as any,
          { fps: 10, qrbox: 250 },
          decodedText => lookupToken(extractToken(decodedText)),
          undefined,
        );
        if (!cancelled) setCameraError(null);
      } catch (e: any) {
        if (cancelled) return;
        // Denied, or no camera at all. The hardware-scanner field below still
        // works, so this is a notice rather than a dead end.
        setCameraError(e?.message || 'เปิดกล้องไม่ได้');
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      /**
       * Shutting a scanner down that never started.
       *
       * html5-qrcode's stop() THROWS synchronously when the camera was never
       * running — it does not return a rejected promise — so a .catch() on the
       * call was never reached, and refreshing this page on a machine with no
       * camera threw out of the cleanup. Hence the try, not just the catch.
       */
      try {
        const state = scanner.getState?.();
        const running = state === Html5QrcodeScannerState.SCANNING
          || state === Html5QrcodeScannerState.PAUSED;
        const stopped = running ? scanner.stop() : Promise.resolve();
        Promise.resolve(stopped)
          .catch(() => {})
          .finally(() => { try { scanner.clear(); } catch { /* already gone */ } });
      } catch {
        try { scanner.clear(); } catch { /* already gone */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the hardware-scanner field ready without stealing focus from a form
  // the user is actually typing in.
  useEffect(() => {
    if (booking || mode !== 'scan') return;
    const el = wedgeRef.current;
    if (el && document.activeElement !== el) el.focus();
  }, [booking, mode, starting]);

  const pauseCamera = () => {
    try {
      if (scannerRef.current?.getState() === Html5QrcodeScannerState.SCANNING) scannerRef.current.pause(true);
    } catch { /* never started, or already stopped */ }
  };

  const resumeCamera = () => {
    try {
      if (scannerRef.current?.getState() === Html5QrcodeScannerState.PAUSED) scannerRef.current.resume();
    } catch { /* never started, or already stopped */ }
  };

  const submitWedge = () => {
    const token = extractToken(wedgeValue);
    setWedgeValue('');
    if (token) {
      lastScannedRef.current = null; // a deliberate re-scan is not a duplicate
      lookupToken(token);
    }
  };

  const switchMode = (newMode: 'scan' | 'manual') => {
    setMode(newMode);
    setError(null);
    setPhoneResults(null);
    if (newMode === 'manual') {
      pauseCamera();
    } else {
      lastScannedRef.current = null;
      resumeCamera();
    }
  };

  const scanAgain = () => {
    setBooking(null);
    setError(null);
    setPhoneResults(null);
    setPhoneInput('');
    lastScannedRef.current = null;
    if (mode === 'scan') resumeCamera();
  };

  const searchByPhone = async () => {
    const phone = phoneInput.trim();
    if (!phone) return;
    setPhoneSearchLoading(true);
    setError(null);
    setPhoneResults(null);
    try {
      const res = await client.get(`${API_BASE}/checkin/search-by-phone/${encodeURIComponent(phone)}`);
      if (res.data.success) {
        const results: PhoneSearchResult[] = res.data.bookings || [];
        if (results.length === 0) setError('ไม่พบข้อมูลการจองสำหรับเบอร์โทรนี้');
        else if (results.length === 1) await lookupToken(results[0].qr_token);
        else setPhoneResults(results);
      }
    } catch (e: any) {
      handleRequestError(e, 'ไม่สามารถค้นหาได้');
    } finally {
      setPhoneSearchLoading(false);
    }
  };

  const toggleAction = async (actionId: number) => {
    if (!booking) return;
    setTogglingActionId(actionId);
    try {
      const res = await client.post(`${API_BASE}/checkin/${booking.id}/actions/${actionId}/toggle`);
      if (res.data.success) {
        setBooking(prev => prev ? {
          ...prev,
          actions: prev.actions.map(a => a.id === actionId
            ? { ...a, checked_at: res.data.checked ? new Date().toISOString() : null }
            : a),
        } : prev);
        setRosterKey(k => k + 1);
      }
    } catch (e: any) {
      handleRequestError(e, 'ไม่สามารถบันทึกได้');
    } finally {
      setTogglingActionId(null);
    }
  };

  // Which survey/test forms these people have already answered, matched on
  // their names and the account phone. A survey is filled in from a link, not
  // from inside a booking, so there is no id joining the two — the desk asks
  // "who has answered anything under these names?" and staff read the answer
  // alongside the tick-boxes they were using as a memory aid before.
  useEffect(() => {
    if (!booking?.id) { setSurveyHistory(null); return; }
    let cancelled = false;
    setSurveyLoading(true);
    client.get(`${API_BASE}/checkin/${booking.id}/survey-history`)
      .then(res => { if (!cancelled) setSurveyHistory(res.data.success ? res.data.submissions : []); })
      // A failure here must not look like "has not answered" — null is the
      // "could not check" state and renders as such.
      .catch(() => { if (!cancelled) setSurveyHistory(null); })
      .finally(() => { if (!cancelled) setSurveyLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id]);

  // Whatever the family filled in on the registration form for this
  // booking — staff previously only saw the lookup's own bare fields
  // (nickname/course/parent phone), with no way to see, say, which team
  // they picked or any other custom question's answer, right at check-in.
  useEffect(() => {
    if (!booking?.form_submission_id) { setFormFields(null); return; }
    let cancelled = false;
    setFormLoading(true);
    client.get(`${API_BASE}/bookings/${booking.id}/form-answers`)
      .then(res => { if (!cancelled) setFormFields(res.data.success ? res.data.fields : []); })
      .catch(() => { if (!cancelled) setFormFields([]); })
      .finally(() => { if (!cancelled) setFormLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, booking?.form_submission_id]);

  // For a form-based registration, the form's own person answers ARE the
  // attendees — lead with those once loaded (the system child the seat is
  // technically booked under stays out of the display entirely, matching
  // the booking list/detail views). Form-less bookings keep the system
  // child name as before.
  const pinnedFields = (formFields || []).filter(f => isPinned(f) && hasValue(f));
  const restFields = (formFields || []).filter(f => !pinnedFields.includes(f));

  const formPeople = (formFields || []).filter(f => f.type === 'family_member_picker' && f.value);
  const attendeeName = formPeople.length > 0
    ? formPeople.map(formatFormFieldValue).join(' · ')
    : (booking?.child_nickname || booking?.child_name
      || [booking?.parent_first_name, booking?.parent_last_name].filter(Boolean).join(' ')
      || 'ผู้เข้าร่วม');
  const attendeeRealName = formPeople.length > 0
    ? null
    : (booking?.child_name && booking.child_name !== attendeeName
      ? `${booking.child_name}${booking.child_name_en ? ` (${booking.child_name_en})` : ''}`
      : (booking?.child_name_en || null));

  return (
    <Box>
      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}

      {/* The round picker on top, then the scanner and the roster side by
          side. The scanner goes in as children so it is never unmounted —
          html5-qrcode's pause/resume act on one exact DOM element. */}
      <CheckinRoundPanel
        client={client}
        canClose={canCloseRound}
        refreshKey={rosterKey}
        hidden={!!booking}
        onPick={token => { void lookupToken(token, true); }}
      >
      {!booking && (
        <Tabs value={mode} onChange={(_, v) => switchMode(v)} sx={{ mb: 2, minHeight: 40 }}>
          <Tab value="scan" label="สแกน QR" icon={<ScanIcon fontSize="small" />} iconPosition="start" sx={{ minHeight: 40 }} />
          <Tab value="manual" label="กรอกเบอร์โทร" icon={<PhoneIcon fontSize="small" />} iconPosition="start" sx={{ minHeight: 40 }} />
        </Tabs>
      )}

      {/* Kept mounted at all times (just hidden via CSS once a result is
          showing or manual mode is active) — html5-qrcode's pause/resume
          act on this exact DOM element, so conditionally unmounting it
          would break resume(). */}
      <Paper sx={{ p: 3, borderRadius: 3, width: '100%', boxSizing: 'border-box', display: (booking || mode !== 'scan') ? 'none' : 'block' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          ส่อง QR Code ของผู้เข้าร่วมที่ได้รับหลังจองสำเร็จ หรือยิงด้วยเครื่องสแกน
        </Typography>

        {/* Always present, always focused: a handheld scanner types into
            whatever has focus and presses Enter, so the field has to be ready
            before anyone thinks to click it. */}
        <TextField
          inputRef={wedgeRef}
          fullWidth size="small" autoComplete="off"
          label="ยิงด้วยเครื่องสแกน / วางโค้ด"
          value={wedgeValue}
          onChange={e => setWedgeValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitWedge(); } }}
          onBlur={() => { if (!booking && mode === 'scan') setTimeout(() => wedgeRef.current?.focus(), 0); }}
          helperText="ยิงแล้วระบบจะค้นหาให้ทันที ไม่ต้องกดปุ่มใดๆ"
          sx={{ mb: 2 }}
        />

        {starting && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">กำลังเปิดกล้อง...</Typography>
          </Box>
        )}
        {noCamera && (
          <Alert severity="info" sx={{ mb: 2 }}>
            เครื่องนี้ไม่มีกล้อง — ใช้เครื่องสแกนยิงที่ช่องด้านบน กดชื่อจากรายชื่อ หรือกรอกเบอร์โทรแทนได้
          </Alert>
        )}
        {cameraError && !noCamera && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            เปิดกล้องไม่ได้ ({cameraError}) — ใช้เครื่องสแกนยิงที่ช่องด้านบน หรือกรอกเบอร์โทรแทนได้
          </Alert>
        )}
        <div id={SCANNER_ELEMENT_ID} />
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
      </Paper>

      {!booking && mode === 'manual' && (
        <Paper sx={{ p: 3, borderRadius: 3, width: '100%', boxSizing: 'border-box' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            กรอกเบอร์โทรศัพท์ของผู้ปกครองเพื่อค้นหาการจอง
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="เบอร์โทรศัพท์"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchByPhone()}
            />
            <Button
              variant="contained"
              onClick={searchByPhone}
              disabled={phoneSearchLoading || !phoneInput.trim()}
              sx={{ borderRadius: 2, px: 3 }}
            >
              {phoneSearchLoading ? <CircularProgress size={20} color="inherit" /> : 'ค้นหา'}
            </Button>
          </Box>

          {phoneResults && phoneResults.length > 1 && (
            <List dense sx={{ mt: 2 }}>
              {phoneResults.map((b) => {
                const name = b.child_nickname || b.child_name || 'ผู้เข้าร่วม';
                return (
                  <ListItem
                    key={b.booking_id}
                    onClick={() => lookupToken(b.qr_token)}
                    sx={{ borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <Avatar src={b.child_avatar || undefined} sx={{ mr: 2, width: 36, height: 36, flexShrink: 0 }}>{name[0]}</Avatar>
                    <ListItemText
                      primary={`${name} · ${b.course_name}`}
                      secondary={new Date(b.scheduled_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                      primaryTypographyProps={{ sx: { fontSize: 15, fontWeight: 700, wordBreak: 'break-word' } }}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Paper>
      )}
      </CheckinRoundPanel>

      {booking && (
        <Paper sx={{ p: 3, borderRadius: 3, maxWidth: 480, width: '100%', boxSizing: 'border-box' }}>
          {/* Read out loud across a desk and matched against a printed list,
              so it is the largest thing on the card after the name. */}
          <Box sx={{ mb: 1.5, px: 1.5, py: 1, borderRadius: 2, bgcolor: '#f4f1fe', border: '1px solid #e6e0fb' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', lineHeight: 1 }}>
              หมายเลขจอง
            </Typography>
            <Typography sx={{ fontWeight: 900, fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.5px', color: '#5b3fd1' }}>
              #{booking.id}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
            <Avatar src={booking.child_avatar || undefined} sx={{ width: 56, height: 56, bgcolor: 'primary.main', flexShrink: 0 }}>
              {attendeeName[0]}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.25, wordBreak: 'break-word' }}>{attendeeName}</Typography>
              {attendeeRealName && (
                <Typography variant="body2" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>{attendeeRealName}</Typography>
              )}
              <Typography variant="body1" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{booking.course_name}</Typography>
              <Chip
                size="small"
                label={new Date(booking.scheduled_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                sx={{ mt: 0.5, maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
              />
            </Box>
          </Box>

          {booking.parent_phone && (
            <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 2, wordBreak: 'break-word' }}>
              ผู้ปกครอง: {[booking.parent_first_name, booking.parent_last_name].filter(Boolean).join(' ')} · {booking.parent_phone}
            </Typography>
          )}

          {/* Only when it has actually happened, and only when it is more than
              a one-off: "ไม่มา 1 จาก 5" is noise on a card someone reads in
              three seconds, while a pattern is worth a phone call. */}
          {(booking.no_show_history?.missed ?? 0) >= 2 && (
            <Alert severity="info" icon={<AbsentIcon />} sx={{ mb: 2, borderRadius: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                เคยไม่มาตามนัด {booking.no_show_history!.missed} จาก {booking.no_show_history!.of} ครั้งล่าสุด
              </Typography>
            </Alert>
          )}

          {/* Above everything else on the card, including the fold. */}
          {pinnedFields.length > 0 && (
            <Alert
              severity="warning" icon={<WarningIcon />}
              sx={{ mb: 2, borderRadius: 2, alignItems: 'flex-start' }}
            >
              {pinnedFields.map((f, i) => (
                <Box key={i} sx={{ mb: i === pinnedFields.length - 1 ? 0 : 0.75 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', opacity: 0.85 }}>
                    {f.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, wordBreak: 'break-word' }}>
                    {formatFormFieldValue(f)}
                  </Typography>
                </Box>
              ))}
            </Alert>
          )}

          {booking.form_submission_id && (
            <>
              <Divider sx={{ mb: 1.5 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary', flex: 1 }}>
                  ข้อมูลที่กรอกไว้ตอนลงทะเบียน
                </Typography>
                {restFields.length > 0 && (
                  <Button size="small" onClick={() => setAllAnswersOpen(v => !v)} sx={{ fontWeight: 700 }}>
                    {allAnswersOpen ? 'ย่อ' : `ดูทั้งหมด (${restFields.length})`}
                  </Button>
                )}
              </Box>
              {formLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}><CircularProgress size={18} /></Box>
              ) : !allAnswersOpen ? (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
                  {restFields.length > 0
                    ? `ซ่อนไว้ ${restFields.length} ข้อ — กด “ดูทั้งหมด” เมื่อต้องการค้นข้อมูล`
                    : 'ไม่มีข้อมูลเพิ่มเติม'}
                </Typography>
              ) : restFields.length > 0 ? (
                <Box sx={{ mb: 2 }}>
                  {restFields.map((f, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, py: 0.5 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, maxWidth: '45%', wordBreak: 'break-word' }}>{f.label}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, textAlign: 'right', flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                        {formatFormFieldValue(f)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.disabled" sx={{ display: 'block', mb: 2 }}>ไม่มีข้อมูลที่กรอกไว้</Typography>
              )}
            </>
          )}

          <Divider sx={{ mb: 1 }} />

          <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid #eef0f3' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
              แบบสอบถามที่ตอบแล้ว
            </Typography>
            {surveyLoading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">กำลังค้นหา...</Typography>
              </Stack>
            ) : surveyHistory === null ? (
              <Typography variant="body2" color="text.disabled">ตรวจสอบไม่ได้ในขณะนี้</Typography>
            ) : surveyHistory.length === 0 ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label="ยังไม่พบการตอบ" sx={{ fontWeight: 800, bgcolor: '#fdf1e7', color: '#a15c00' }} />
                <Typography variant="caption" color="text.secondary">ค้นจากชื่อและเบอร์ในการจองนี้</Typography>
              </Stack>
            ) : (
              <Stack spacing={1}>
                {surveyHistory.map((sub: any) => (
                  <Stack key={sub.id} direction="row" spacing={1} alignItems="flex-start">
                    <Chip size="small" label="ตอบแล้ว" color="success" sx={{ fontWeight: 800, flexShrink: 0 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>{sub.form_name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                        {[
                          sub.respondent_name,
                          new Date(String(sub.created_at).replace(' ', 'T') + 'Z')
                            .toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
                          sub.has_answer_key && sub.total_score != null ? `${sub.total_score}/${sub.max_score}` : null,
                        ].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>

          {/* CRM only. A note is what WE wrote about a family, and medals are
              a result being recorded — neither belongs to a link that gets
              forwarded around a group chat. */}
          {canCloseRound && (
            <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: '1px solid #eef0f3' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 1 }}>
                โน้ตของเจ้าหน้าที่
              </Typography>
              <BookingNoteBox
                client={client}
                bookingId={booking.id}
                initialNote={note}
                minRows={2}
                onSaved={setNote}
              />
            </Box>
          )}

          {canCloseRound && (
            <Button
              fullWidth variant="outlined" startIcon={<MedalIcon />}
              onClick={() => setAwardsOpen(true)}
              sx={{ mb: 2, borderRadius: 2, fontWeight: 700 }}
            >
              แสตมป์ · เหรียญรางวัล
            </Button>
          )}

          {canCloseRound && awardsOpen && (
            <BookingAwardsDialog
              bookingId={booking.id}
              childName={attendeeName}
              courseName={booking.course_name}
              onClose={() => setAwardsOpen(false)}
            />
          )}

          {booking.actions.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ py: 2, textAlign: 'center' }}>
              คลาส/กิจกรรมนี้ยังไม่ได้ตั้งค่ารายการเช็คอิน — ไปที่หน้าจัดการคลาส/กิจกรรมเพื่อเพิ่ม
            </Typography>
          ) : (
            <List dense>
              {booking.actions.map(action => (
                <ListItem
                  key={action.id}
                  onClick={() => togglingActionId === null && toggleAction(action.id)}
                  sx={{ borderRadius: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Checkbox
                    checked={!!action.checked_at}
                    disabled={togglingActionId === action.id}
                    icon={<CheckIcon sx={{ color: 'action.disabled' }} />}
                    checkedIcon={<CheckIcon color="success" />}
                    sx={{ flexShrink: 0 }}
                  />
                  <ListItemText
                    primary={action.label}
                    secondary={action.checked_at ? new Date(action.checked_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : undefined}
                    primaryTypographyProps={{ sx: { fontSize: 16, fontWeight: 700, wordBreak: 'break-word' } }}
                    secondaryTypographyProps={{ sx: { fontSize: 13 } }}
                  />
                </ListItem>
              ))}
            </List>
          )}

          <Button
            fullWidth
            variant="contained"
            startIcon={<RescanIcon />}
            onClick={scanAgain}
            sx={{ mt: 2, borderRadius: 2, fontWeight: 700 }}
          >
            สแกนคนต่อไป
          </Button>
        </Paper>
      )}
    </Box>
  );
};

export default CheckinScannerCore;
