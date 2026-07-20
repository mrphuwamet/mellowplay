// Detects a YouTube link inside free-form post text (not an isolated
// video_url field like NewsDetail's getVideoEmbed) so any member's post
// can auto-embed a playable video, not just admin-authored news items.
const YOUTUBE_PATTERN = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
const URL_PATTERN = /https?:\/\/\S+/g;

export const extractYouTubeEmbedUrl = (text: string): string | null => {
  const urls = text.match(URL_PATTERN);
  if (!urls) return null;
  for (const url of urls) {
    const match = url.match(YOUTUBE_PATTERN);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return null;
};
