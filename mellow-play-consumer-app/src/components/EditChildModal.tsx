import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';
import { Toast } from './Toast';
import { cleanNamePrefix } from '../utils/nameUtils';

interface EditChildModalProps {
  isOpen: boolean;
  onClose: () => void;
  childInfo?: {
    id: number;
    name: string;
    nickname?: string;
    dob?: string;
    relation?: string;
    gender?: string;
  };
}

const EditChildModal: React.FC<EditChildModalProps> = ({ isOpen, onClose, childInfo }) => {
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

  React.useEffect(() => {
    if (childInfo && isOpen) {
      const parts = childInfo.name.split(' ');
      setFormData({
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
        nickname: childInfo.nickname || '',
        gender: childInfo.gender || 'Boy',
        dob: childInfo.dob || '',
        relation: ['Mother', 'Father', 'Brother', 'Sister', 'Grandparent'].includes(childInfo.relation || '') 
          ? (childInfo.relation || 'Mother') 
          : 'Other',
        customRelation: ['Mother', 'Father', 'Brother', 'Sister', 'Grandparent'].includes(childInfo.relation || '') 
          ? '' 
          : (childInfo.relation || '')
      });
    }
  }, [childInfo, isOpen]);

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
      const fullName = `${cleanNamePrefix(formData.firstName)} ${cleanNamePrefix(formData.lastName)}`.trim();
      const payload = {
        name: fullName,
        nickname: formData.nickname,
        dob: formData.dob,
        relation: formData.relation === 'Other' && formData.customRelation 
          ? formData.customRelation 
          : formData.relation,
        gender: formData.gender
      };
      
      const response = await apiClient.put(`/profiles/children/${childInfo?.id}`, payload);
      if (response.data.success) {
        // Refresh children
        const userJson = localStorage.getItem('mellow_user');
        if (userJson) {
          const user = JSON.parse(userJson);
          await fetchChildren(user.id);
        }
        onClose();
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
            {lang === 'th' ? 'แก้ไขข้อมูลเด็ก' : 'Edit Child Information'}
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
              <input
                type="date"
                value={formData.dob}
                onChange={e => setFormData({ ...formData, dob: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
                required
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
              className="flex-1 px-4 py-3 bg-mellow-purple text-white rounded-xl font-bold uppercase tracking-widest hover:bg-mellow-purple/90 active:scale-95 transition-all flex justify-center items-center gap-2"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : null}
              {lang === 'th' ? 'บันทึก' : 'Save'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditChildModal;
