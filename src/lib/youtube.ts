// Convierte una URL de YouTube (watch, youtu.be, embed o shorts) en su URL embebida.
export function getYouTubeEmbedUrl(url: string): string | null {
  const raw = (url || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '');

    let videoId = '';
    if (host === 'youtu.be') {
      videoId = parsed.pathname.slice(1);
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/embed/')[1] || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/shorts/')[1] || '';
      } else if (parsed.pathname.startsWith('/live/')) {
        videoId = parsed.pathname.split('/live/')[1] || '';
      }
    } else {
      return null;
    }

    videoId = videoId.split(/[?&/]/)[0];
    if (!videoId) return null;

    const start = parsed.searchParams.get('t') || parsed.searchParams.get('start');
    const startSeconds = start ? parseInt(start.replace(/s$/, ''), 10) : 0;
    const query = startSeconds > 0 ? `?start=${startSeconds}` : '';
    return `https://www.youtube.com/embed/${videoId}${query}`;
  } catch {
    return null;
  }
}
