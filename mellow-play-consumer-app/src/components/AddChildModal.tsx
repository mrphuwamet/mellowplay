import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';
import { Toast } from './Toast';
import { cleanNamePrefix } from '../utils/nameUtils';
import DateField from './DateField';

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
  const { t, lang } = useTranslation();
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    nickname: '',
    gender: 'Boy',
    dob: '',
    relation: 'Mother',
    customRelation: ''
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.dob) {
      setError(t.login?.fillRequiredInfo || 'Please fill out all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        dob: ddmmyyyyToISO(formData.dob),
        name: `${cleanNamePrefix(formData.firstName)} ${cleanNamePrefix(formData.lastName)}`.trim(),
        relation: formData.relation === 'Other' && formData.customRelation
          ? formData.customRelation
          : formData.relation
      };
      
      const response = await apiClient.post('/profiles/children', payload);
      if (response.data.success) {
        // Refresh children
        const userJson = localStorage.getItem('mellow_user');
        if (userJson) {
          const user = JSON.parse(userJson);
          await fetchChildren(user.id);
        }
        setFormData({ firstName: '', lastName: '', nickname: '', gender: 'Boy', dob: '', relation: 'Mother', customRelation: '' });
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                  {t.register?.firstNameLabel || 'First Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                  {t.register?.lastNameLabel || 'Last Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
                  required
                />
              </div>
            </div>
            <p className="text-[10px] text-mellow-purple/70 font-bold px-1 -mt-2">
              * {lang === 'th' ? 'ไม่ต้องระบุคำนำหน้าชื่อ (เช่น ด.ช., ด.ญ.)' : 'No title prefix needed (e.g. Master, Miss)'}
            </p>
            
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                {t.register?.nickname || 'Nickname'}
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                {t.register?.dateOfBirth || 'Date of Birth'} <span className="text-red-500">*</span>
              </label>
              <DateField
                value={formData.dob}
                onChange={(v) => setFormData({ ...formData, dob: v })}
                placeholder={t.register?.dobPlaceholder || 'DD/MM/YYYY'}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                {lang === 'th' ? 'เพศ' : 'Gender'}
              </label>
              <select
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              >
                <option value="Boy">{lang === 'th' ? 'ชาย' : 'Boy'}</option>
                <option value="Girl">{lang === 'th' ? 'หญิง' : 'Girl'}</option>
                <option value="Not Specified">{lang === 'th' ? 'ไม่ระบุ' : 'Not Specified'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
                {t.register?.relationship || 'Relationship'}
              </label>
              <select
                value={formData.relation}
                onChange={e => setFormData({ ...formData, relation: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
              >
                <option value="Mother">{t.register?.mother || 'Mother'}</option>
                <option value="Father">{t.register?.father || 'Father'}</option>
                <option value="Relative">{t.register?.relative || 'Relative'}</option>
                <option value="Other">{t.register?.other || 'Other'}</option>
              </select>
            </div>
            
            {formData.relation === 'Other' && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <input
                  type="text"
                  placeholder={lang === 'th' ? 'โปรดระบุความสัมพันธ์...' : 'Please specify relationship...'}
                  value={formData.customRelation}
                  onChange={e => setFormData({ ...formData, customRelation: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
                  required
                />
              </div>
            )}
            
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
