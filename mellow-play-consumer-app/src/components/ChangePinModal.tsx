import React, { useState } from 'react';
import { X, ShieldCheck, Loader2 } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import PinPad from './PinPad';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'current' | 'new' | 'confirm';

const ChangePinModal: React.FC<ChangePinModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { lang } = useTranslation();
  const [step, setStep] = useState<Step>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const reset = () => {
    setStep('current');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async (finalNewPin: string) => {
    setIsBusy(true);
    setError('');
    try {
      const res = await apiClient.post('/auth/change-password', {
        currentPassword: currentPin,
        newPassword: finalNewPin,
      });
      if (res.data.success) {
        reset();
        onSuccess();
      }
    } catch (err: any) {
      const message = err.response?.data?.message || (lang === 'en' ? 'Failed to change PIN.' : 'เปลี่ยน PIN ไม่สำเร็จ');
      // A wrong current PIN should go back to that step, not sit on the
      // "PINs don't match" confirm step where the message wouldn't make sense.
      setStep('current');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setError(message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative w-full max-w-sm bg-white rounded-[28px] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={handleClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
          <X size={16} />
        </button>

        <div className="w-14 h-14 rounded-full bg-mellow-purple/10 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={22} className="text-mellow-purple" />
        </div>

        <h3 className="text-lg font-black text-slate-800 mb-1 text-center">
          {lang === 'en' ? 'Change PIN' : 'เปลี่ยน PIN'}
        </h3>
        <p className="text-xs font-bold text-slate-400 text-center mb-4">
          {step === 'current' && (lang === 'en' ? 'Enter your current PIN' : 'กรอก PIN ปัจจุบันของคุณ')}
          {step === 'new' && (lang === 'en' ? 'Enter a new PIN' : 'ตั้ง PIN ใหม่')}
          {step === 'confirm' && (lang === 'en' ? 'Confirm your new PIN' : 'ยืนยัน PIN ใหม่')}
        </p>

        {error && <p className="text-xs font-bold text-red-500 text-center mb-3">{error}</p>}

        {step === 'current' && (
          <PinPad
            length={6}
            value={currentPin}
            onChange={(val) => {
              setCurrentPin(val);
              if (val.length === 6) setTimeout(() => setStep('new'), 200);
            }}
          />
        )}

        {step === 'new' && (
          <PinPad
            length={6}
            value={newPin}
            onChange={(val) => {
              setNewPin(val);
              if (val.length === 6) setTimeout(() => setStep('confirm'), 200);
            }}
          />
        )}

        {step === 'confirm' && (
          <PinPad
            length={6}
            value={confirmPin}
            onChange={(val) => {
              setConfirmPin(val);
              if (val.length === 6) {
                if (val === newPin) {
                  setTimeout(() => submit(val), 200);
                } else {
                  setError(lang === 'en' ? 'PINs do not match' : 'PIN ไม่ตรงกัน');
                  setConfirmPin('');
                  setNewPin('');
                  setStep('new');
                }
              }
            }}
          />
        )}

        {isBusy && (
          <div className="flex justify-center mt-4">
            <Loader2 className="animate-spin text-mellow-purple" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangePinModal;
