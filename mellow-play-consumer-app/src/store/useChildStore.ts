import { create } from 'zustand';
import apiClient from '../utils/apiClient';
import { DEFAULT_CHARACTER_AVATAR_ID } from '../utils/characterAvatars';

interface Child {
  id: number;
  name: string;
  nickname?: string;
  relation?: string;
  gender?: string;
  dob?: string;
  avatar: string;
  customPhotoUrl?: string;
  level: number;
  hd_type?: string;
  hd_profile?: string;
  centers_json?: string;
  hd_strategy?: string;
  hd_authority?: string;
  littleJuniorBalance: number;
  juniorBalance: number;
  coupons?: { id: number; name: string; color: string; icon_url?: string; balance: number; total_earned: number; }[];
  membershipType?: string;
  membershipExpiresAt?: string;
}

interface ChildStore {
  children: Child[];
  selectedChildId: number | null;
  isLoading: boolean;
  error: string | null;
  fetchChildren: (userId: number | string) => Promise<void>;
  selectChild: (id: number) => void;
  getSelectedChild: () => Child | null;
  updateAvatar: (childId: number, avatar: string) => Promise<void>;
  setCustomPhotoUrl: (childId: number, url: string) => void;
  deletePhoto: (childId: number) => Promise<void>;
  updateChildInfo: (childId: number, name: string) => Promise<void>;
}

const SELECTED_CHILD_KEY = 'mellow_selected_child_id';

export const useChildStore = create<ChildStore>((set, get) => ({
  children: [],
  selectedChildId: null,
  isLoading: false,
  error: null,

  fetchChildren: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get(`/profiles?userId=${userId}`);
      if (response.data.success) {
        const mappedChildren = response.data.profiles.map((p: any) => ({
          id: p.child_id || p.id,
          name: p.name,
          nickname: p.nickname,
          relation: p.relation,
          gender: p.gender,
          dob: p.birth_date,
          avatar: p.avatar || DEFAULT_CHARACTER_AVATAR_ID,
          customPhotoUrl: p.custom_photo_url || undefined,
          level: p.current_level || 1,
          hd_type: p.hd_type,
          hd_profile: p.hd_profile,
          centers_json: p.centers_json,
          hd_strategy: p.hd_strategy,
          hd_authority: p.hd_authority,
          littleJuniorBalance: p.little_junior_balance || 0,
          juniorBalance: p.junior_balance || 0,
          coupons: p.coupons || [],
          membershipType: p.membership_type,
          membershipExpiresAt: p.membership_expires_at,
        }));

        // Restore previously selected child from localStorage (survives refresh)
        const savedId = localStorage.getItem(SELECTED_CHILD_KEY);
        const savedChild = savedId 
          ? mappedChildren.find((c: any) => c.id === parseInt(savedId))
          : null;
        const resolvedId = savedChild
          ? savedChild.id
          : (mappedChildren.length > 0 ? mappedChildren[0].id : null);

        set({ 
          children: mappedChildren, 
          selectedChildId: resolvedId,
          isLoading: false 
        });
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  selectChild: (id) => {
    localStorage.setItem(SELECTED_CHILD_KEY, String(id));
    set({ selectedChildId: id });
  },

  getSelectedChild: () => {
    const { children, selectedChildId } = get();
    return children.find(c => c.id === selectedChildId) || null;
  },

  updateAvatar: async (childId: number, avatar: string) => {
    try {
      const response = await apiClient.put(`/profiles/${childId}/avatar`, { avatar });
      if (response.data.success) {
        set(state => ({
          children: state.children.map(c => c.id === childId ? { ...c, avatar } : c)
        }));
      }
    } catch (err) {
      console.error("Failed to update avatar:", err);
    }
  },

  // Uploading a photo already writes both `avatar` and `custom_photo_url` on
  // the backend in one call — this just mirrors that into local state so the
  // picker can show the persisted photo without a full refetch.
  setCustomPhotoUrl: (childId: number, url: string) => {
    set(state => ({
      children: state.children.map(c => c.id === childId ? { ...c, avatar: url, customPhotoUrl: url } : c)
    }));
  },

  deletePhoto: async (childId: number) => {
    try {
      const response = await apiClient.delete(`/profiles/${childId}/photo`);
      if (response.data.success) {
        set(state => ({
          children: state.children.map(c => c.id === childId
            ? { ...c, customPhotoUrl: undefined, avatar: c.avatar === c.customPhotoUrl ? DEFAULT_CHARACTER_AVATAR_ID : c.avatar }
            : c
          )
        }));
      }
    } catch (err) {
      console.error("Failed to delete photo:", err);
    }
  },

  updateChildInfo: async (childId: number, name: string) => {
    set(state => ({
      children: state.children.map(c => c.id === childId ? { ...c, name } : c)
    }));
  }
}));
