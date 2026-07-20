import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, User, Users, Plus, ArrowRight, Trash2 } from 'lucide-react';
import { Toast } from '../components/Toast';
import apiClient from '../utils/apiClient';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import DateField from '../components/DateField';
import FieldHint from '../components/FieldHint';
import { cleanNamePrefix } from '../utils/nameUtils';
import logo from '../assets/ui/logo.svg';
import ResponsiveModal from '../components/ResponsiveModal';

interface ChildInput {
  firstName: string;
  lastName: string;
  nickname: string;
  gender: string;
  dob: string;
  relation: string;
  customRelation?: string;
}

interface ChildFieldErrors {
  firstName?: string;
  nickname?: string;
  gender?: string;
  dob?: string;
  customRelation?: string;
}

const ddmmyyyyToISO = (value: string) => {
  const [d, m, y] = value.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

const emptyChild = (): ChildInput => ({ firstName: '', lastName: '', nickname: '', gender: '', dob: '', relation: '', customRelation: '' });

const AddChild = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [children, setChildren] = useState<ChildInput[]>([emptyChild()]);
  const [childErrors, setChildErrors] = useState<ChildFieldErrors[]>([{}]);
  const [childToRemove, setChildToRemove] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAddChild = () => {
    setChildren([...children, emptyChild()]);
    setChildErrors((prev) => [...prev, {}]);
  };

  const handleRemoveChild = (index: number) => {
    if (children.length > 1) {
      const newChildren = [...children];
      newChildren.splice(index, 1);
      setChildren(newChildren);
      setChildErrors((prev) => {
        const newErrs = [...prev];
        newErrs.splice(index, 1);
        return newErrs;
      });
    }
  };

  const handleChildChange = (index: number, field: keyof ChildInput, value: string) => {
    const newChildren = [...children];
    newChildren[index][field] = value;
    setChildren(newChildren);

    setChildErrors((prev) => {
      if (!prev[index]?.[field as keyof ChildFieldErrors]) return prev;
      const newErrs = [...prev];
      newErrs[index] = { ...newErrs[index], [field]: undefined };
      return newErrs;
    });
  };

  const validateChildren = () => {
    const cErrs: ChildFieldErrors[] = children.map((c) => {
      const e: ChildFieldErrors = {};
      if (!c.firstName.trim()) e.firstName = t.register.requiredFirstName;
      if (!c.nickname.trim()) e.nickname = t.register.requiredNickname;
      if (!c.gender) e.gender = t.register.requiredGender;
      if (!c.dob) e.dob = t.register.requiredDob;
      if (c.relation === 'Other' && !(c.customRelation || '').trim()) e.customRelation = t.register.requiredRelation;
      return e;
    });
    setChildErrors(cErrs);
    return !cErrs.some((e) => Object.keys(e).length > 0);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateChildren()) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      for (const child of children) {
        await apiClient.post('/profiles/children', {
          name: `${cleanNamePrefix(child.firstName)} ${child.lastName ? cleanNamePrefix(child.lastName) : ''}`.trim(),
          nickname: child.nickname,
          gender: child.gender,
          dob: ddmmyyyyToISO(child.dob),
          relation: child.relation === 'Other' && child.customRelation ? child.customRelation : child.relation
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
          {children.map((child, index) => (
            <div key={index} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 relative group">
              {children.length > 1 && (
                <button
                  type="button"
                  onClick={() => setChildToRemove(index)}
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

              <div className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.firstNameLabel}</label>
                    <FieldHint message={childErrors[index]?.firstName} />
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <User size={18} />
                      </div>
                      <input
                        type="text"
                        placeholder={t.register.firstName}
                        value={child.firstName}
                        onChange={(e) => handleChildChange(index, 'firstName', e.target.value)}
                        className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.lastNameLabel}</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <User size={18} />
                      </div>
                      <input
                        type="text"
                        placeholder={t.register.lastName}
                        value={child.lastName}
                        onChange={(e) => handleChildChange(index, 'lastName', e.target.value)}
                        className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-mellow-purple/70 font-bold -mt-2">
                  * {t.register.noTitlePrefix}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.nickname}</label>
                    <FieldHint message={childErrors[index]?.nickname} />
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <User size={18} />
                      </div>
                      <input
                        type="text"
                        placeholder={t.register.nickname}
                        value={child.nickname}
                        onChange={(e) => handleChildChange(index, 'nickname', e.target.value)}
                        className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.genderLabel}</label>
                    <FieldHint message={childErrors[index]?.gender} />
                    <select
                      value={child.gender}
                      onChange={(e) => handleChildChange(index, 'gender', e.target.value)}
                      className="w-full px-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    >
                      <option value="" disabled>{t.register.selectGender}</option>
                      <option value="Boy">{t.register.genderBoy}</option>
                      <option value="Girl">{t.register.genderGirl}</option>
                      <option value="Other">{t.register.genderOther}</option>
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.dateOfBirth}</label>
                  <FieldHint message={childErrors[index]?.dob} />
                  <DateField
                    value={child.dob}
                    onChange={(v) => handleChildChange(index, 'dob', v)}
                    placeholder={t.register.dobPlaceholder}
                    className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    iconSize={18}
                  />
                </div>

                <div className="relative">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">{t.register.relationship}{t.register.optionalSuffix}</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Users size={18} />
                    </div>
                    <select
                      value={child.relation}
                      onChange={(e) => handleChildChange(index, 'relation', e.target.value)}
                      className="w-full pl-11 pr-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    >
                      <option value="">{t.register.notSpecified}</option>
                      <option value="Father">{t.register.father}</option>
                      <option value="Mother">{t.register.mother}</option>
                      <option value="Relative">{t.register.relative}</option>
                      <option value="Other">{t.register.other}</option>
                    </select>
                  </div>
                </div>

                {child.relation === 'Other' && (
                  <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                    <FieldHint message={childErrors[index]?.customRelation} />
                    <input
                      type="text"
                      placeholder={t.register?.specifyRelation || 'Please specify relationship...'}
                      value={child.customRelation || ''}
                      onChange={(e) => handleChildChange(index, 'customRelation', e.target.value)}
                      className="w-full px-4 py-[14px] bg-white border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddChild}
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

      <ResponsiveModal isOpen={childToRemove !== null} onClose={() => setChildToRemove(null)} variant="dialog" size="xs" className="text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{t.register.removeChildTitle}</h3>
            <p className="text-sm font-bold text-slate-500 mb-6">{t.register.removeChildDesc}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setChildToRemove(null)}
                className="flex-1 py-[14px] rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200"
              >
                {t.register.removeChildCancel}
              </button>
              <button
                onClick={() => {
                  if (childToRemove !== null) handleRemoveChild(childToRemove);
                  setChildToRemove(null);
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
