import char1 from '../assets/charactor-mp/1.png';
import char2 from '../assets/charactor-mp/2.png';
import char3 from '../assets/charactor-mp/3.png';
import char4 from '../assets/charactor-mp/4.png';
import char5 from '../assets/charactor-mp/5.png';
import char6 from '../assets/charactor-mp/6.png';

export interface CharacterAvatar {
  id: string;
  label: string;
  src: string;
}

// Default avatar options — sourced from src/assets/charactor-mp.
export const CHARACTER_AVATARS: CharacterAvatar[] = [
  { id: 'char-1', label: 'Character 1', src: char1 },
  { id: 'char-2', label: 'Character 2', src: char2 },
  { id: 'char-3', label: 'Character 3', src: char3 },
  { id: 'char-4', label: 'Character 4', src: char4 },
  { id: 'char-5', label: 'Character 5', src: char5 },
  { id: 'char-6', label: 'Character 6', src: char6 }
];

export const DEFAULT_CHARACTER_AVATAR_ID = CHARACTER_AVATARS[0].id;
