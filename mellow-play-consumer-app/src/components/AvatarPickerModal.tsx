import React, { useRef, useState } from 'react';
import { X, Check, Upload, Loader2 } from 'lucide-react';
import ChildAvatar from './ChildAvatar';
import apiClient from '../utils/apiClient';

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar: string;
  onSelect: (avatarId: string) => void;
  childId?: number;
}

export const AVATAR_OPTIONS = [
  { id: 'boy', label: 'Boy 1' },
  { id: 'girl', label: 'Girl 1' },
  { id: 'bear', label: 'Bear' },
  { id: 'rabbit', label: 'Rabbit' },
  { id: 'cat', label: 'Cat' },
  { id: 'dog', label: 'Dog' },
];

const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({ isOpen, onClose, currentAvatar, onSelect, childId }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string>(currentAvatar);

  React.useEffect(() => {
    if (isOpen) {
      setPendingSelection(currentAvatar);
    }
  }, [isOpen, currentAvatar]);

  if (!isOpen) return null;

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !childId) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiClient.post(`/profiles/${childId}/upload-avatar`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        setPendingSelection(response.data.url);
      }
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
        >
          <X size={20} />
        </button>

        <h3 className="text-xl font-black text-slate-800 mb-6 text-center">เลือกรูปโปรไฟล์</h3>

        {childId && (
          <div className="mb-6 flex justify-center">
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 px-6 py-3 bg-mellow-purple text-white rounded-full font-bold shadow-lg hover:bg-mellow-purple/90 transition-colors disabled:opacity-70"
            >
              {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
              <span>อัปโหลดรูปภาพ</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          {AVATAR_OPTIONS.map((avatar) => {
            const isSelected = pendingSelection === avatar.id;
            return (
              <button
                key={avatar.id}
                onClick={() => setPendingSelection(avatar.id)}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                  isSelected 
                    ? 'border-mellow-purple bg-mellow-purple/5 shadow-md scale-105' 
                    : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                }`}
              >
                <ChildAvatar avatarType={avatar.id} className="w-16 h-16 shadow-sm" />
                {isSelected && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-mellow-purple rounded-full flex items-center justify-center text-white shadow-md border-2 border-white">
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
          
          {/* Display uploaded custom avatar if it's currently selected */}
          {pendingSelection && !AVATAR_OPTIONS.find(a => a.id === pendingSelection) && (
            <button
              onClick={() => {}}
              className="relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all border-mellow-purple bg-mellow-purple/5 shadow-md scale-105"
            >
              <ChildAvatar avatarType={pendingSelection} className="w-14 h-14" />
              <span className="text-xs font-bold text-mellow-purple">Custom</span>
              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-mellow-purple text-white flex items-center justify-center shadow-lg">
                <Check size={14} />
              </div>
            </button>
          )}
        </div>

        <button 
          onClick={() => {
            onSelect(pendingSelection);
            onClose();
          }}
          disabled={!pendingSelection}
          className="w-full mellow-btn-primary h-12 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Check size={18} /> ยืนยันการเปลี่ยนแปลง
        </button>
      </div>
    </div>
  );
};

export default AvatarPickerModal;
