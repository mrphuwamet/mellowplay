import { create } from 'zustand';
import apiClient from '../utils/apiClient';

interface Child {
  id: number;
  name: string;
  avatar: string;
  level: number;
  hd_type?: string;
  hd_profile?: string;
}

interface ChildStore {
  children: Child[];
  selectedChildId: number | null;
  isLoading: boolean;
  error: string | null;
  fetchChildren: (userId: number | string) => Promise<void>;
  selectChild: (id: number) => void;
  getSelectedChild: () => Child | null;
}

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
          id: p.id,
          name: p.name,
          avatar: p.relation === 'son' ? '👦' : '👧',
          level: 1, // Default level, ideally from a Child table join
          hd_type: p.hd_type,
          hd_profile: p.hd_profile
        }));
        set({ 
          children: mappedChildren, 
          selectedChildId: mappedChildren.length > 0 ? mappedChildren[0].id : null,
          isLoading: false 
        });
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  selectChild: (id) => set({ selectedChildId: id }),

  getSelectedChild: () => {
    const { children, selectedChildId } = get();
    return children.find(c => c.id === selectedChildId) || null;
  }
}));
