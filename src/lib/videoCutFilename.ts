export function getVideoCutFilename(label: string, id: string): string {
  const sanitizedLabel = label
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .trim()
    .slice(0, 180)
    .replace(/[. ]+$/g, '');
  const filename = sanitizedLabel || `corte-${id}`;
  const safeFilename = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)
    ? `_${filename}`
    : filename;

  return `${safeFilename}.mp4`;
}
