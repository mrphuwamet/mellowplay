import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, ArrowRight, Trash2 } from 'lucide-react';
import { Toast } from '../components/Toast';
import apiClient from '../utils/apiClient';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import { cleanNamePrefix } from '../utils/nameUtils';
import logo from '../assets/ui/logo.svg';
import ResponsiveModal from '../components/ResponsiveModal';
import FamilyMemberFields, { emptyFamilyMemberFormValue, type FamilyMemberFormValue } from '../components/FamilyMemberFields';
import { OTHER_FAMILY_ROLE } from '../utils/familyRoles';

const ddmmyyyyToISO = (value: string) => {
  const [d, m, y] = value.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

const AddChild = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [members, setMembers] = useState<FamilyMemberFormValue[]>([emptyFamilyMemberFormValue('child')]);
  const [memberErrors, setMemberErrors] = useState<Array<Record<string, string>>>([{}]);
  const [memberToRemove, setMemberToRemove] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAddMember = () => {
    setMembers([...members, emptyFamilyMemberFormValue('child')]);
    setMemberErrors((prev) => [...prev, {}]);
  };

  const handleRemoveMember = (index: number) => {
    if (members.length > 1) {
      const newMembers = [...members];
      newMembers.splice(index, 1);
      setMembers(newMembers);
      setMemberErrors((prev) => {
        const newErrs = [...prev];
        newErrs.splice(index, 1);
        return newErrs;
      });
    }
  };

  const handleMemberChange = (index: number, value: FamilyMemberFormValue) => {
    const newMembers = [...members];
    newMembers[index] = value;
    setMembers(newMembers);
    setMemberErrors((prev) => {
      if (!Object.keys(prev[index] || {}).length) return prev;
      const newErrs = [...prev];
      newErrs[index] = {};
      return newErrs;
    });
  };

  const validateMembers = () => {
    const errs = members.map((m) => {
      const e: Record<string, string> = {};
      if (!m.firstName.trim()) e.firstName = t.register.requiredFirstName;
      if (!m.nickname.trim()) e.nickname = t.register.requiredNickname;
      if (!m.dob) e.dob = t.register.requiredDob;
      if (m.role === OTHER_FAMILY_ROLE && !m.customRole.trim()) e.customRole = t.register.requiredRelation;
      return e;
    });
    setMemberErrors(errs);
    return !errs.some((e) => Object.keys(e).length > 0);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateMembers()) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      for (const member of members) {
        await apiClient.post('/profiles/children', {
          name: `${cleanNamePrefix(member.firstName)} ${member.lastName ? cleanNamePrefix(member.lastName) : ''}`.trim(),
          nickname: member.nickname,
          gender: member.gender,
          dob: ddmmyyyyToISO(member.dob),
          relation: member.role === OTHER_FAMILY_ROLE && member.customRole ? member.customRole : member.role,
        });
      }
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || t.register.registerFailed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mellow-flow-page flex flex-col px-8 bg-white">
      <header className="pt-10 mb-8 flex justify-end">
        <LanguageToggle />
      </header>

      <div className="text-center mb-10">
        <img src={logo} alt="Mellow Play" className="h-10 mx-auto mb-4" />
        <h1 className="text-2xl font-black text-mellow-ink">{t.register.addChildPageTitle}</h1>
        <p className="text-slate-400 font-bold mt-2">{t.register.addChildPageDesc}</p>
      </div>

      <Toast message={error || ''} type="error" onClose={() => setError('')} />

      <form onSubmit={handleSave} noValidate className="space-y-4 flex-1 flex flex-col">
        <div className="space-y-4">
          {members.map((member, index) => (
            <div key={index} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 relative group">
              {members.length > 1 && (
                <button
                  type="button"
                  onClick={() => setMemberToRemove(index)}
                  className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                >
                  <Trash2 size={16} />
                </button>
              )}

              <div className="mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-mellow-purple/10 text-mellow-purple flex items-center justify-center text-xs font-black">
                  {index + 1}
                </div>
                <h3 className="font-black text-mellow-ink text-sm">{t.register.childInfo}</h3>
              </div>

              <FamilyMemberFields
                value={member}
                onChange={(v) => handleMemberChange(index, v)}
                errors={memberErrors[index]}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddMember}
          className="w-full py-[14px] border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 font-bold text-sm hover:border-mellow-purple hover:text-mellow-purple transition-all"
        >
          <Plus size={18} /> {t.register.addChild}
        </button>

        <div className="mt-auto pt-4 flex flex-col gap-3">
          <button type="submit" disabled={isLoading} className="w-full mellow-btn-primary">
            {isLoading ? <Loader2 className="animate-spin" /> : <>{t.common.save} <ArrowRight size={20} /></>}
          </button>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="w-full text-center text-sm font-bold text-slate-400 hover:text-slate-500"
          >
            {t.register.skip}
          </button>
        </div>
      </form>

      <ResponsiveModal isOpen={memberToRemove !== null} onClose={() => setMemberToRemove(null)} variant="dialog" size="xs" className="text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{t.register.removeChildTitle}</h3>
            <p className="text-sm font-bold text-slate-500 mb-6">{t.register.removeChildDesc}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setMemberToRemove(null)}
                className="flex-1 py-[14px] rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200"
              >
                {t.register.removeChildCancel}
              </button>
              <button
                onClick={() => {
                  if (memberToRemove !== null) handleRemoveMember(memberToRemove);
                  setMemberToRemove(null);
                }}
                className="flex-1 py-[14px] rounded-xl font-bold text-white bg-red-500 hover:bg-red-600"
              >
                {t.register.removeChildConfirm}
              </button>
            </div>
      </ResponsiveModal>
    </div>
  );
};

export default AddChild;
