import {
  DirectionsRun,
  FitnessCenter,
  PanTool,
  Lightbulb,
  Forum,
  Psychology,
  People,
  EmojiEmotions,
  Rule,
  HourglassEmpty,
  Hearing,
  CenterFocusStrong,
  Group,
  Star,
  MusicNote,
  Brush,
  Science,
  SportsSoccer,
  SportsBasketball,
  SportsGymnastics,
  ChildCare,
  School,
  AutoAwesome,
  Favorite,
  FlashOn,
  Extension,
  ColorLens,
  NaturePeople,
  Spa,
  Timer,
  Chat,
  EmojiObjects,
  Accessibility,
  SelfImprovement,
  RecordVoiceOver,
  Balance,
  SportsKabaddi,
  Gesture,
  Casino,
  Memory,
} from '@mui/icons-material';
import React from 'react';
import type { SvgIconProps } from '@mui/material';

export type SkillType = 'achievement' | 'indicator';

export interface SkillItem {
  id: number;
  name: string;
  type: SkillType;
  icon: string;
  color?: string;
}

const STORAGE_KEY = 'crm-skills-library-v1';

export const ICON_OPTIONS: { key: string; label: string; Component: React.ElementType }[] = [
  { key: 'DirectionsRun', label: 'วิ่ง/เคลื่อนไหว', Component: DirectionsRun },
  { key: 'FitnessCenter', label: 'ออกกำลังกาย', Component: FitnessCenter },
  { key: 'PanTool', label: 'มือ/กล้ามเนื้อมัดเล็ก', Component: PanTool },
  { key: 'Accessibility', label: 'ร่างกาย', Component: Accessibility },
  { key: 'SportsGymnastics', label: 'ยิมนาสติก', Component: SportsGymnastics },
  { key: 'SportsKabaddi', label: 'ต่อสู้/กีฬาทีม', Component: SportsKabaddi },
  { key: 'SportsSoccer', label: 'ฟุตบอล', Component: SportsSoccer },
  { key: 'SportsBasketball', label: 'บาสเกตบอล', Component: SportsBasketball },
  { key: 'Gesture', label: 'ท่าทาง', Component: Gesture },
  { key: 'Balance', label: 'สมดุล', Component: Balance },
  { key: 'Lightbulb', label: 'ความคิดสร้างสรรค์', Component: Lightbulb },
  { key: 'EmojiObjects', label: 'ไอเดีย', Component: EmojiObjects },
  { key: 'Psychology', label: 'ความคิด/สมอง', Component: Psychology },
  { key: 'Science', label: 'วิทยาศาสตร์', Component: Science },
  { key: 'Memory', label: 'ความจำ', Component: Memory },
  { key: 'Extension', label: 'ปริศนา/ทักษะ', Component: Extension },
  { key: 'Casino', label: 'เกม/กลยุทธ์', Component: Casino },
  { key: 'Forum', label: 'การสื่อสาร', Component: Forum },
  { key: 'Chat', label: 'พูดคุย', Component: Chat },
  { key: 'RecordVoiceOver', label: 'พูด/นำเสนอ', Component: RecordVoiceOver },
  { key: 'People', label: 'สังคม', Component: People },
  { key: 'Group', label: 'ทำงานเป็นทีม', Component: Group },
  { key: 'ChildCare', label: 'เด็ก', Component: ChildCare },
  { key: 'School', label: 'การเรียนรู้', Component: School },
  { key: 'MusicNote', label: 'ดนตรี', Component: MusicNote },
  { key: 'Brush', label: 'ศิลปะ/วาดรูป', Component: Brush },
  { key: 'ColorLens', label: 'สี/ศิลปะ', Component: ColorLens },
  { key: 'NaturePeople', label: 'ธรรมชาติ', Component: NaturePeople },
  { key: 'EmojiEmotions', label: 'อารมณ์/ความมั่นใจ', Component: EmojiEmotions },
  { key: 'Favorite', label: 'ความรัก/ความใส่ใจ', Component: Favorite },
  { key: 'Spa', label: 'ความสงบ/สมาธิ', Component: Spa },
  { key: 'SelfImprovement', label: 'สมาธิ/การพัฒนาตน', Component: SelfImprovement },
  { key: 'Rule', label: 'ระเบียบ/วินัย', Component: Rule },
  { key: 'HourglassEmpty', label: 'ความอดทน', Component: HourglassEmpty },
  { key: 'Timer', label: 'เวลา', Component: Timer },
  { key: 'Hearing', label: 'การฟัง', Component: Hearing },
  { key: 'CenterFocusStrong', label: 'สมาธิ/โฟกัส', Component: CenterFocusStrong },
  { key: 'AutoAwesome', label: 'ความเป็นเลิศ', Component: AutoAwesome },
  { key: 'FlashOn', label: 'ความว่องไว', Component: FlashOn },
  { key: 'Star', label: 'ดาว/ความสำเร็จ', Component: Star },
];

export const renderSkillIcon = (iconKey: string, props?: SvgIconProps): React.ReactElement => {
  const found = ICON_OPTIONS.find((o) => o.key === iconKey);
  if (found) return React.createElement(found.Component, props);
  return React.createElement(Star, props);
};

const defaultSkills: SkillItem[] = [
  { id: 1, name: 'ทักษะการเคลื่อนไหว', type: 'achievement', icon: 'DirectionsRun', color: '#7452d6' },
  { id: 2, name: 'ความสมดุลของร่างกาย', type: 'achievement', icon: 'Balance', color: '#7452d6' },
  { id: 3, name: 'ทักษะกล้ามเนื้อมัดเล็ก', type: 'achievement', icon: 'PanTool', color: '#7452d6' },
  { id: 4, name: 'ทักษะกล้ามเนื้อมัดใหญ่', type: 'achievement', icon: 'SportsKabaddi', color: '#7452d6' },
  { id: 5, name: 'ความคิดสร้างสรรค์', type: 'achievement', icon: 'Lightbulb', color: '#7452d6' },
  { id: 6, name: 'ทักษะการสื่อสาร', type: 'achievement', icon: 'Forum', color: '#7452d6' },
  { id: 7, name: 'ทักษะการแก้ปัญหา', type: 'achievement', icon: 'Psychology', color: '#7452d6' },
  { id: 8, name: 'ทักษะการทำงานร่วมกัน', type: 'achievement', icon: 'Group', color: '#7452d6' },
  { id: 9, name: 'ทักษะดนตรี', type: 'achievement', icon: 'MusicNote', color: '#7452d6' },
  { id: 10, name: 'ทักษะศิลปะ', type: 'achievement', icon: 'Brush', color: '#7452d6' },
  { id: 11, name: 'ความมั่นใจในตนเอง', type: 'indicator', icon: 'EmojiEmotions', color: '#ef4f55' },
  { id: 12, name: 'ความมีวินัย', type: 'indicator', icon: 'Rule', color: '#ef4f55' },
  { id: 13, name: 'ความอดทน', type: 'indicator', icon: 'HourglassEmpty', color: '#ef4f55' },
  { id: 14, name: 'ทักษะการฟัง', type: 'indicator', icon: 'Hearing', color: '#ef4f55' },
  { id: 15, name: 'ความมีสมาธิ', type: 'indicator', icon: 'CenterFocusStrong', color: '#ef4f55' },
  { id: 16, name: 'การทำงานเป็นทีม', type: 'indicator', icon: 'People', color: '#ef4f55' },
  { id: 17, name: 'ความกระตือรือร้น', type: 'indicator', icon: 'FlashOn', color: '#ef4f55' },
  { id: 18, name: 'ความรับผิดชอบ', type: 'indicator', icon: 'Star', color: '#ef4f55' },
];

export const getSkillsLibrary = (): SkillItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SkillItem[];
  } catch {
    // ignore
  }
  return [...defaultSkills];
};

export const saveSkillsLibrary = (items: SkillItem[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const getSkillsByType = (type: SkillType): SkillItem[] =>
  getSkillsLibrary().filter((s) => s.type === type);

export const generateSkillId = (): number =>
  Date.now();
