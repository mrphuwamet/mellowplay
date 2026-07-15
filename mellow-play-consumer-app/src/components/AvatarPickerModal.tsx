import React, { useRef, useState } from 'react';
import { X, Check, Upload, Loader2, Trash2 } from 'lucide-react';
import ChildAvatar from './ChildAvatar';
import apiClient from '../utils/apiClient';
import { CHARACTER_AVATARS } from '../utils/characterAvatars';
import LoadingOverlay from './LoadingOverlay';

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar: string;
  onSelect: (avatarId: string) => void;
  childId?: number;
  customPhotoUrl?: string;
  onPhotoUploaded?: (url: string) => void;
  onDeletePhoto?: () => void;
}

// Default avatar options now come from src/assets/charactor-mp.
export const AVATAR_OPTIONS = CHARACTER_AVATARS;

const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  isOpen, onClose, currentAvatar, onSelect, childId, customPhotoUrl, onPhotoUploaded, onDeletePhoto,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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
        onPhotoUploaded?.(response.data.url);
      }
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleDeletePhoto = async () => {
    if (!onDeletePhoto || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeletePhoto();
      if (pendingSelection === customPhotoUrl) {
        setPendingSelection(CHARACTER_AVATARS[0].id);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[85vh] overflow-y-auto">
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
              <span>{customPhotoUrl ? 'เปลี่ยนรูปที่อัปโหลด' : 'อัปโหลดรูปภาพ'}</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Persisted uploaded photo — stays available even when a character is active */}
          {customPhotoUrl && (
            <button
              onClick={() => setPendingSelection(customPhotoUrl)}
              className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                pendingSelection === customPhotoUrl
                  ? 'border-mellow-purple bg-mellow-purple/5 shadow-md scale-105'
                  : 'border-slate-100 bg-slate-50 hover:border-slate-200'
              }`}
            >
              <ChildAvatar avatarType={customPhotoUrl} className="w-16 h-16 shadow-sm" />
              <span className="text-[11px] font-bold text-slate-500">รูปของฉัน</span>
              {pendingSelection === customPhotoUrl && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-mellow-purple rounded-full flex items-center justify-center text-white shadow-md border-2 border-white">
                  <Check size={14} strokeWidth={3} />
                </div>
              )}
              {onDeletePhoto && (
                <div
                  role="button"
                  onClick={(e) => { e.stopPropagation(); handleDeletePhoto(); }}
                  className="absolute -top-2 -left-2 w-6 h-6 bg-white rounded-full flex items-center justify-center text-red-500 shadow-md border-2 border-red-100 active:scale-90 transition-transform"
                >
                  {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </div>
              )}
            </button>
          )}

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

      <LoadingOverlay active={isUploading} message="กำลังอัปโหลดรูปภาพ..." />
    </div>
  );
};

export default AvatarPickerModal;
