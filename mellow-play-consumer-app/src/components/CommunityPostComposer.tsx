import React from 'react';
import { Image as ImageIcon, X, Loader2, Send, Plus, BarChart2 } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import { resolveImageUrl } from '../utils/courseImage';

interface CommunityPostComposerProps {
  onPostCreated: (post: any) => void;
}

const MAX_LENGTH = 5000;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 4;

const CommunityPostComposer: React.FC<CommunityPostComposerProps> = ({ onPostCreated }) => {
  const { lang } = useTranslation();
  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;
  const canAttachImage = !!user?.isCommunityAdmin;

  const [postType, setPostType] = React.useState<'text' | 'poll'>('text');
  const [content, setContent] = React.useState('');
  const [pollOptions, setPollOptions] = React.useState(['', '']);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const removeImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const switchType = (type: 'text' | 'poll') => {
    setPostType(type);
    setError('');
    if (type === 'poll') removeImage();
  };

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const addPollOption = () => {
    setPollOptions((prev) => (prev.length < MAX_POLL_OPTIONS ? [...prev, ''] : prev));
  };

  const removePollOption = (index: number) => {
    setPollOptions((prev) => (prev.length > MIN_POLL_OPTIONS ? prev.filter((_, i) => i !== index) : prev));
  };

  const resetForm = () => {
    setContent('');
    setPollOptions(['', '']);
    setPostType('text');
    removeImage();
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;

    let cleanOptions: string[] = [];
    if (postType === 'poll') {
      cleanOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (cleanOptions.length < MIN_POLL_OPTIONS) {
        setError(lang === 'en' ? `A poll needs at least ${MIN_POLL_OPTIONS} options` : `โพลต้องมีอย่างน้อย ${MIN_POLL_OPTIONS} ตัวเลือก`);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('content', trimmed);
      if (postType === 'poll') {
        fd.append('postType', 'poll');
        fd.append('pollOptions', JSON.stringify(cleanOptions));
      } else if (imageFile && canAttachImage) {
        fd.append('file', imageFile);
      }
      const res = await apiClient.post('/community/posts', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.success) {
        onPostCreated(res.data.post);
        resetForm();
      } else {
        setError(res.data.message || (lang === 'en' ? 'Failed to post.' : 'โพสต์ไม่สำเร็จ'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (lang === 'en' ? 'Failed to post.' : 'โพสต์ไม่สำเร็จ'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 pb-2">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => switchType('text')}
          className={`px-3 py-1.5 rounded-full text-[12px] font-black transition-colors ${postType === 'text' ? 'bg-mellow-purple text-white' : 'bg-slate-50 text-slate-400'}`}
        >
          {lang === 'en' ? 'Text' : 'ข้อความ'}
        </button>
        <button
          onClick={() => switchType('poll')}
          className={`px-3 py-1.5 rounded-full text-[12px] font-black flex items-center gap-1 transition-colors ${postType === 'poll' ? 'bg-mellow-purple text-white' : 'bg-slate-50 text-slate-400'}`}
        >
          <BarChart2 size={12} />
          {lang === 'en' ? 'Poll' : 'โพลสำรวจ'}
        </button>
      </div>

      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
          {user?.avatarUrl ? (
            <img src={resolveImageUrl(user.avatarUrl)} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-black text-slate-400">{(user?.displayName || user?.firstName)?.[0] || '?'}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-end mb-1">
            <span className={`text-[11px] font-bold ${content.length >= MAX_LENGTH ? 'text-red-500' : 'text-slate-300'}`}>
              {content.length}/{MAX_LENGTH}
            </span>
          </div>
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_LENGTH))}
              placeholder={
                postType === 'poll'
                  ? (lang === 'en' ? 'Ask a question...' : 'ตั้งคำถามสำหรับโพล...')
                  : (lang === 'en' ? "Share your story..." : 'แชร์เรื่องราวของคุณ...')
              }
              rows={3}
              className="w-full resize-none bg-slate-50 border border-slate-100 rounded-2xl pl-4 pr-12 py-2.5 text-[14px] font-medium focus:outline-none"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !content.trim()}
              className="absolute right-2.5 bottom-3 w-8 h-8 rounded-full bg-mellow-purple text-white flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>

      {postType === 'poll' && (
        <div className="mt-1 ml-[52px] space-y-2">
          {pollOptions.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={option}
                onChange={(e) => updatePollOption(index, e.target.value)}
                placeholder={lang === 'en' ? `Option ${index + 1}` : `ตัวเลือกที่ ${index + 1}`}
                maxLength={80}
                className="flex-1 min-w-0 bg-slate-50 border border-slate-100 rounded-full px-4 py-2 text-[13px] font-medium focus:outline-none"
              />
              {pollOptions.length > MIN_POLL_OPTIONS && (
                <button onClick={() => removePollOption(index)} className="w-7 h-7 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < MAX_POLL_OPTIONS && (
            <button
              onClick={addPollOption}
              className="w-full flex items-center justify-center gap-1.5 bg-slate-50 border border-dashed border-slate-200 rounded-full px-4 py-2 text-[13px] font-bold text-mellow-purple active:scale-[0.98] transition-transform"
            >
              <Plus size={13} />
              {lang === 'en' ? 'Add option' : 'เพิ่มตัวเลือก'}
            </button>
          )}
        </div>
      )}

      {postType === 'text' && imagePreviewUrl && (
        <div className="relative mt-3 ml-[52px] rounded-2xl overflow-hidden bg-slate-50">
          <img src={imagePreviewUrl} alt="" className="w-full max-h-[280px] object-cover" />
          <button
            onClick={removeImage}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/60 text-white flex items-center justify-center active:scale-90 transition-transform"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {error && <p className="text-xs font-bold text-red-500 mt-2 ml-[52px]">{error}</p>}

      {postType === 'text' && canAttachImage && (
        <div className="mt-3 ml-[52px]">
          <label className="w-9 h-9 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center cursor-pointer active:scale-90 transition-transform">
            <ImageIcon size={16} />
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={submitting} />
          </label>
        </div>
      )}
    </div>
  );
};

export default CommunityPostComposer;
