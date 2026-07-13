import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Mail, Phone, Save, Loader2, Settings as SettingsIcon } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import { useChildStore } from '../store/useChildStore';
import EditChildModal from '../components/EditChildModal';
import AddChildModal from '../components/AddChildModal';
import { ChildAvatar } from '../components/ChildAvatar';

const SettingsProfile = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { children, fetchChildren } = useChildStore();
  const [isEditChildOpen, setIsEditChildOpen] = useState(false);
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<any>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    const userJson = localStorage.getItem('mellow_user');
    if (userJson) {
      const user = JSON.parse(userJson);
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        email: user.email || '',
      });
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    const userJson = localStorage.getItem('mellow_user');
    if (!userJson) {
      setError('User not found. Please log in.');
      setIsLoading(false);
      return;
    }

    const user = JSON.parse(userJson);

    try {
      // Call PUT /admin/users/:id endpoint to update profile
      const response = await apiClient.put(`/admin/users/${user.id}`, {
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        email: formData.email,
      });

      if (response.data.success) {
        // Update user details in localStorage
        const updatedUser = {
          ...user,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          email: formData.email,
        };
        localStorage.setItem('mellow_user', JSON.stringify(updatedUser));
        setSuccess('Profile updated successfully!');
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mellow-page bg-[#fbfaf7]">
      {/* Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[16px] font-black tracking-tight leading-none">Parent Profile Settings</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <main className="p-5">
        <div className="mellow-card bg-white shadow-xl relative overflow-hidden p-6 mb-6">
          <h2 className="text-xl font-black text-slate-800 mb-6">Parent Information</h2>

          <form onSubmit={handleSave} className="space-y-4">
            {success && (
              <div className="p-4 bg-green-50 text-green-600 rounded-2xl text-xs font-bold border border-green-100 mb-4 text-center">
                {success}
              </div>
            )}
            {error && (
              <div className="p-4 bg-red-50 text-red-500 rounded-2xl text-xs font-bold border border-red-100 mb-4 text-center">
                {error}
              </div>
            )}

            {/* First Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">First Name</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">Last Name</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">Phone Number</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Phone size={18} />
                </div>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">Email Address</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 transition-all"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mellow-btn-primary mt-6"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Save size={18} />
                  Save Changes
                </>
              )}
            </button>
          </form>
        </div>

        {/* Children Settings Section */}
        {children.length > 0 && (
          <div className="mellow-card bg-white shadow-xl relative overflow-hidden p-6 mb-6">
            <h2 className="text-xl font-black text-slate-800 mb-6">Child Profiles</h2>
            <div className="space-y-4">
              {children.map((child) => (
                <div key={child.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <ChildAvatar avatarType={child.avatar} className="w-12 h-12 rounded-full ring-2 ring-white shadow-sm" />
                    <div>
                      <h3 className="font-black text-slate-800 text-[15px] leading-tight">{child.name}</h3>
                      <p className="text-xs font-bold text-slate-400 mt-0.5 uppercase tracking-widest">{child.relation || 'Child'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingChild({
                        id: child.id,
                        name: child.name,
                        nickname: child.nickname || '',
                        dob: child.dob || '',
                        relation: child.relation || 'Child'
                      });
                      setIsEditChildOpen(true);
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-mellow-purple hover:border-mellow-purple/30 hover:bg-mellow-purple/5 transition-colors shadow-sm"
                  >
                    <SettingsIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
            
            <button
              onClick={() => setIsAddChildOpen(true)}
              className="mt-6 w-full py-3.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 font-bold hover:bg-slate-50 hover:border-slate-300 hover:text-slate-600 transition-all flex items-center justify-center gap-2"
            >
              <User size={18} />
              {t.home?.addChild || 'เพิ่มข้อมูลเด็ก'}
            </button>
          </div>
        )}
      </main>

      <EditChildModal 
        isOpen={isEditChildOpen}
        onClose={() => setIsEditChildOpen(false)}
        childData={editingChild}
        onSuccess={async () => {
          setIsEditChildOpen(false);
          const userJson = localStorage.getItem('mellow_user');
          if (userJson) {
            const user = JSON.parse(userJson);
            await fetchChildren(user.id);
          }
        }}
      />

      <AddChildModal 
        isOpen={isAddChildOpen}
        onClose={() => setIsAddChildOpen(false)}
        onSuccess={async () => {
          setIsAddChildOpen(false);
          const userJson = localStorage.getItem('mellow_user');
          if (userJson) {
            const user = JSON.parse(userJson);
            await fetchChildren(user.id);
          }
        }}
      />
    </div>
  );
};

export default SettingsProfile;
