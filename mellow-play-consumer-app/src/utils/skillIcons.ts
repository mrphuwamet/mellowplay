import React from 'react';
import {
  Footprints, Dumbbell, Hand, Accessibility, PersonStanding, Swords, CircleDot, Target, Move,
  Scale, Lightbulb, Brain, FlaskConical, BrainCircuit, Puzzle, Dices, MessagesSquare, MessageCircle,
  Mic, Users, UsersRound, Baby, GraduationCap, Music, Brush, Palette, Trees, Smile, Heart, Flower2,
  TrendingUp, ListChecks, Hourglass, Timer, Ear, Focus, Sparkles, Zap, Star,
  type LucideIcon,
} from 'lucide-react';

// The CRM's Skills Library (SkillsLibraryManagement.tsx / utils/skillsLibrary.ts)
// stores each skill's configured icon as an @mui/icons-material component
// name (e.g. "DirectionsRun"). This app doesn't depend on MUI at all, so
// rather than pull in @mui/icons-material + Emotion just to render a
// handful of badge icons, each MUI key is mapped to its closest lucide-react
// equivalent here. This is what makes a skill's icon on Course Detail /
// Booking actually reflect what staff picked in the CRM, instead of every
// skill showing the same generic sparkle regardless of its real icon.
const SKILL_ICON_MAP: Record<string, LucideIcon> = {
  DirectionsRun: Footprints,
  FitnessCenter: Dumbbell,
  PanTool: Hand,
  Accessibility: Accessibility,
  SportsGymnastics: PersonStanding,
  SportsKabaddi: Swords,
  SportsSoccer: CircleDot,
  SportsBasketball: Target,
  Gesture: Move,
  Balance: Scale,
  Lightbulb: Lightbulb,
  EmojiObjects: Lightbulb,
  Psychology: Brain,
  Science: FlaskConical,
  Memory: BrainCircuit,
  Extension: Puzzle,
  Casino: Dices,
  Forum: MessagesSquare,
  Chat: MessageCircle,
  RecordVoiceOver: Mic,
  People: Users,
  Group: UsersRound,
  ChildCare: Baby,
  School: GraduationCap,
  MusicNote: Music,
  Brush: Brush,
  ColorLens: Palette,
  NaturePeople: Trees,
  EmojiEmotions: Smile,
  Favorite: Heart,
  Spa: Flower2,
  SelfImprovement: TrendingUp,
  Rule: ListChecks,
  HourglassEmpty: Hourglass,
  Timer: Timer,
  Hearing: Ear,
  CenterFocusStrong: Focus,
  AutoAwesome: Sparkles,
  FlashOn: Zap,
  Star: Star,
};

// Mirrors the CRM's own renderSkillIcon fallback (unrecognized/missing key -> Star).
export const SkillIcon = ({ iconKey, size = 13 }: { iconKey?: string | null; size?: number }): React.ReactElement => {
  const Component = (iconKey && SKILL_ICON_MAP[iconKey]) || Star;
  return React.createElement(Component, { size });
};
