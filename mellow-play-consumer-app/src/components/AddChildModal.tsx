import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';
import { Toast } from './Toast';
import { cleanNamePrefix } from '../utils/nameUtils';
import FamilyMemberFields, { emptyFamilyMemberFormValue, type FamilyMemberFormValue } from './FamilyMemberFields';
import { OTHER_FAMILY_ROLE } from '../utils/familyRoles';

interface AddChildModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
}

const ddmmyyyyToISO = (value: string) => {
  const [d, m, y] = value.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

const AddChildModal: React.FC<AddChildModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formValue, setFormValue] = useState<FamilyMemberFormValue>(emptyFamilyMemberFormValue('mother'));

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formValue.firstName.trim() || !formValue.lastName.trim() || !formValue.dob) {
      setError(t.login?.fillRequiredInfo || 'Please fill out all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        firstName: formValue.firstName,
        lastName: formValue.lastName,
        nickname: formValue.nickname,
        gender: formValue.gender,
        dob: ddmmyyyyToISO(formValue.dob),
        name: `${cleanNamePrefix(formValue.firstName)} ${cleanNamePrefix(formValue.lastName)}`.trim(),
        relation: formValue.role === OTHER_FAMILY_ROLE && formValue.customRole ? formValue.customRole : formValue.role,
      };

      const response = await apiClient.post('/profiles/children', payload);
      if (response.data.success) {
        // Refresh children
        const userJson = localStorage.getItem('mellow_user');
        if (userJson) {
          const user = JSON.parse(userJson);
          await fetchChildren(user.id);
        }
        setFormValue(emptyFamilyMemberFormValue('mother'));
        onClose();
        await onSuccess?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add child');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-mellow-ink/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-black text-mellow-ink">
            {t.register?.addChild || 'Add Child'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all active:scale-95"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {error && <Toast message={error} type="error" onClose={() => setError('')} />}

          <form onSubmit={handleSubmit} className="space-y-4">
            <FamilyMemberFields value={formValue} onChange={setFormValue} />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 mt-6 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg shadow-mellow-purple/10 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : (t.common?.save || 'Save')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddChildModal;
