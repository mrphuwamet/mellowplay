import React from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

interface ConfirmationChannelNoticeProps {
  /** Courses.sms_success_enabled — whether this course texts on success. */
  smsEnabled: boolean;
  /** Courses.email_success_enabled. */
  emailEnabled: boolean;
}

// Tells the parent, on the success screen, how the confirmation is coming.
//
// The wording is derived from the course's own flags rather than being a fixed
// "you will receive an SMS or email", because that sentence would be a promise
// the system does not always keep: a course can have one channel on, both, or
// neither, and a parent with no email address on file gets the SMS fallback
// instead. Saying "check your email" to someone who will never get one is worse
// than saying nothing.
//
// Mirrors the rules in the backend's bookingNotificationService:
//   - email on + an address on file  -> email (plus SMS if that is on too)
//   - email on + no address          -> falls back to SMS
//   - neither on                     -> nothing is sent, so nothing is claimed
const ConfirmationChannelNotice: React.FC<ConfirmationChannelNoticeProps> = ({ smsEnabled, emailEnabled }) => {
  const { lang } = useTranslation();

  // The address is read at render time from the stored profile — the same source
  // the rest of the app uses — because whether an email actually arrives depends
  // on it existing.
  const email = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('mellow_user');
      return raw ? (JSON.parse(raw).email || '') : '';
    } catch {
      return '';
    }
  }, []);

  const emailWillSend = emailEnabled && !!email;
  // The backend only falls back to SMS when SMS is not already being sent, but
  // for the reader either way means "expect a text", so both collapse to this.
  const smsWillSend = smsEnabled || (emailEnabled && !email);

  if (!emailWillSend && !smsWillSend) return null;

  const both = emailWillSend && smsWillSend;

  const text = lang === 'en'
    ? both
      ? `We'll send your registration confirmation by SMS and to ${email}.`
      : emailWillSend
        ? `We'll send your registration confirmation to ${email}.`
        : "We'll send your registration confirmation by SMS."
    : both
      ? `ระบบจะส่งการยืนยันการลงทะเบียนทาง SMS และอีเมล ${email}`
      : emailWillSend
        ? `ระบบจะส่งการยืนยันการลงทะเบียนไปที่อีเมล ${email}`
        : 'ระบบจะส่งการยืนยันการลงทะเบียนทาง SMS';

  return (
    <div className="w-full bg-mellow-purple-soft rounded-2xl px-4 py-3 flex items-start gap-2.5 mb-4">
      {emailWillSend
        ? <Mail size={16} className="text-mellow-purple shrink-0 mt-0.5" />
        : <MessageSquare size={16} className="text-mellow-purple shrink-0 mt-0.5" />}
      <p className="text-[12.5px] font-bold text-slate-600 leading-relaxed break-all">{text}</p>
    </div>
  );
};

export default ConfirmationChannelNotice;
