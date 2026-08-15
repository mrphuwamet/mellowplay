import { create } from 'zustand';
import apiClient from '../utils/apiClient';
import { DEFAULT_CHARACTER_AVATAR_ID } from '../utils/characterAvatars';

interface Child {
  id: number;
  name: string;
  nameEn?: string;
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

// Which identity the home page currently presents — the account holder
// themselves ('main') or one family member from the roster (a child id).
// This sits alongside selectedChildId rather than replacing it: switching to
// a family member also updates selectedChildId (so Booking/Journey follow),
// but switching to 'main' leaves selectedChildId untouched — those flows
// always operate on a child regardless of whose face the home page shows.
export type ActiveProfile = 'main' | number;

interface ChildStore {
  children: Child[];
  selectedChildId: number | null;
  activeProfile: ActiveProfile;
  isLoading: boolean;
  error: string | null;
  fetchChildren: (userId: number | string) => Promise<void>;
  selectChild: (id: number) => void;
  setActiveProfile: (profile: ActiveProfile) => void;
  getSelectedChild: () => Child | null;
  updateAvatar: (childId: number, avatar: string) => Promise<void>;
  setCustomPhotoUrl: (childId: number, url: string) => void;
  deletePhoto: (childId: number) => Promise<void>;
  updateChildInfo: (childId: number, name: string) => Promise<void>;
}

const SELECTED_CHILD_KEY = 'mellow_selected_child_id';
const ACTIVE_PROFILE_KEY = 'mellow_active_profile';

const loadActiveProfile = (): ActiveProfile => {
  const saved = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (!saved || saved === 'main') return 'main';
  const id = parseInt(saved);
  return isNaN(id) ? 'main' : id;
};

export const useChildStore = create<ChildStore>((set, get) => ({
  children: [],
  selectedChildId: null,
  activeProfile: loadActiveProfile(),
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
          nameEn: p.name_en,
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

        // A stored active profile pointing at a member that no longer
        // exists (removed from the family, other device) falls back to the
        // account holder rather than showing a stale identity.
        const active = get().activeProfile;
        const activeStillValid = active === 'main' || mappedChildren.some((c: any) => c.id === active);

        set({
          children: mappedChildren,
          selectedChildId: resolvedId,
          activeProfile: activeStillValid ? active : 'main',
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

  setActiveProfile: (profile) => {
    localStorage.setItem(ACTIVE_PROFILE_KEY, String(profile));
    if (profile === 'main') {
      set({ activeProfile: profile });
    } else {
      // Switching to a family member also makes them the selected child, so
      // the child-scoped pages (Journey, Booking's default, coupons) follow
      // the same person the home page now shows.
      localStorage.setItem(SELECTED_CHILD_KEY, String(profile));
      set({ activeProfile: profile, selectedChildId: profile });
    }
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
