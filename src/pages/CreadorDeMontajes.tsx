import { useEffect, useMemo, useRef, useState } from 'react';
import './CreadorDeMontajes.css';

export type TextOverlay = {
  id: string;
  text: string;
  startTime: number; // segundos relativos al corte recortado (0 = start)
  endTime: number;   // segundos relativos al corte recortado
  position: 'bottom' | 'top' | 'center' | 'custom';
  customX?: number;  // 0 a 100%
  customY?: number;  // 0 a 100%
  fontSize: number;  // px
  textColor: string;
  bgColor: string;
  bgOpacity: number;
  textAlign: 'left' | 'center' | 'right';
  fontWeight: 'normal' | 'bold';
  hasBorder: boolean;
};

export type AudioTrack = {
  id: string;
  name: string;
  file?: File;
  url: string;
  volume: number;      // 0 a 1
  startTime: number;   // segundo de inicio relativo al montaje global
  duration: number;
  isVoiceOver?: boolean;
};

export type VideoClip = {
  id: string;
  name: string;
  file: File;
  url: string;
  duration: number;    // duración total original del vídeo
  start: number;       // punto In del recorte
  end: number;         // punto Out del recorte
  volume: number;      // 0 a 1
  muted: boolean;
  texts: TextOverlay[];
  thumbnail?: string;
};

type ActiveTab = 'clips' | 'texts' | 'audio' | 'preview' | 'export';

function formatSeconds(secs: number): string {
  if (isNaN(secs) || secs < 0) secs = 0;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}

export default function CreadorDeMontajes() {
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('clips');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Audio global / locución
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Reproductor individual de corte
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Previsualización global
  const globalVideoRef = useRef<HTMLVideoElement | null>(null);
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);
  const [globalCurrentTime, setGlobalCurrentTime] = useState(0);
  const [currentGlobalClipIndex, setCurrentGlobalClipIndex] = useState(0);

  // Exportación
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const cancelExportRef = useRef(false);

  const selectedClip = useMemo(() => {
    return clips.find((c) => c.id === selectedClipId) ?? clips[0] ?? null;
  }, [clips, selectedClipId]);

  // Duración total acumulada del montaje
  const totalMontageDuration = useMemo(() => {
    return clips.reduce((acc, c) => acc + Math.max(0, c.end - c.start), 0);
  }, [clips]);

  // Selección por defecto del primer corte
  useEffect(() => {
    if (clips.length > 0 && (!selectedClipId || !clips.some((c) => c.id === selectedClipId))) {
      setSelectedClipId(clips[0].id);
    }
  }, [clips, selectedClipId]);

  // Cargar miniatura de un vídeo
  const generateThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = URL.createObjectURL(file);
      tempVideo.muted = true;
      tempVideo.currentTime = 0.5;
      tempVideo.onloadeddata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 135;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } else {
          resolve('');
        }
        URL.revokeObjectURL(tempVideo.src);
      };
      tempVideo.onerror = () => resolve('');
    });
  };

  // Cargar vídeos desde el ordenador
  const handleAddVideoFiles = async (files: FileList | File[]) => {
    const newClips: VideoClip[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('video/')) continue;
      const url = URL.createObjectURL(file);

      // Obtener duración
      const duration = await new Promise<number>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.src = url;
        v.onloadedmetadata = () => resolve(v.duration || 5);
        v.onerror = () => resolve(5);
      });

      const thumbnail = await generateThumbnail(file);

      const clip: VideoClip = {
        id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        file,
        url,
        duration: Math.max(duration, 0.5),
        start: 0,
        end: Math.max(duration, 0.5),
        volume: 1,
        muted: false,
        texts: [],
        thumbnail,
      };
      newClips.push(clip);
    }

    if (newClips.length > 0) {
      setClips((prev) => {
        const updated = [...prev, ...newClips];
        if (!selectedClipId) setSelectedClipId(updated[0].id);
        return updated;
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddVideoFiles(e.dataTransfer.files);
    }
  };

  // Reordenación de clips
  const moveClip = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= clips.length) return;
    const updated = [...clips];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setClips(updated);
  };

  const duplicateClip = (clip: VideoClip) => {
    const newClip: VideoClip = {
      ...clip,
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: `${clip.name} (Copia)`,
      texts: clip.texts.map((t) => ({ ...t, id: `txt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` })),
    };
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === clip.id);
      const updated = [...prev];
      updated.splice(idx + 1, 0, newClip);
      return updated;
    });
    setSelectedClipId(newClip.id);
  };

  const removeClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  // Ajustes de corte seleccionado
  const updateSelectedClip = (patch: Partial<VideoClip>) => {
    if (!selectedClip) return;
    setClips((prev) =>
      prev.map((c) => (c.id === selectedClip.id ? { ...c, ...patch } : c))
    );
  };

  // Control de reproducción individual
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !selectedClip) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    // Si sobrepasa el punto final 'end', detener o volver a 'start'
    if (time >= selectedClip.end) {
      videoRef.current.pause();
      videoRef.current.currentTime = selectedClip.start;
      setIsPlaying(false);
    }
  };

  const playTrimmedRange = () => {
    if (!videoRef.current || !selectedClip) return;
    videoRef.current.currentTime = selectedClip.start;
    videoRef.current.play();
    setIsPlaying(true);
  };

  const markInPoint = () => {
    if (!videoRef.current || !selectedClip) return;
    const now = videoRef.current.currentTime;
    const newStart = Math.min(now, selectedClip.end - 0.2);
    updateSelectedClip({ start: Math.max(0, Number(newStart.toFixed(2))) });
  };

  const markOutPoint = () => {
    if (!videoRef.current || !selectedClip) return;
    const now = videoRef.current.currentTime;
    const newEnd = Math.max(now, selectedClip.start + 0.2);
    updateSelectedClip({ end: Math.min(selectedClip.duration, Number(newEnd.toFixed(2))) });
  };

  // Gestión de textos del corte seleccionado
  const addTextOverlay = () => {
    if (!selectedClip) return;
    const clipEffectiveDuration = Math.max(0.5, selectedClip.end - selectedClip.start);
    const newText: TextOverlay = {
      id: `txt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      text: 'Texto explicativo del corte',
      startTime: 0,
      endTime: Number(clipEffectiveDuration.toFixed(1)),
      position: 'bottom',
      fontSize: 28,
      textColor: '#ffffff',
      bgColor: '#000000',
      bgOpacity: 0.75,
      textAlign: 'center',
      fontWeight: 'bold',
      hasBorder: true,
    };
    updateSelectedClip({ texts: [...selectedClip.texts, newText] });
  };

  const updateTextOverlay = (textId: string, patch: Partial<TextOverlay>) => {
    if (!selectedClip) return;
    const updatedTexts = selectedClip.texts.map((t) =>
      t.id === textId ? { ...t, ...patch } : t
    );
    updateSelectedClip({ texts: updatedTexts });
  };

  const removeTextOverlay = (textId: string) => {
    if (!selectedClip) return;
    updateSelectedClip({ texts: selectedClip.texts.filter((t) => t.id !== textId) });
  };

  // Grabación de voz en off
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const duration = recordingSeconds;
        const newTrack: AudioTrack = {
          id: `voice_${Date.now()}`,
          name: `Voz en off (${formatSeconds(duration)})`,
          url: audioUrl,
          volume: 1,
          startTime: 0,
          duration,
          isVoiceOver: true,
        };
        setAudioTracks((prev) => [...prev, newTrack]);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(200);
      setIsRecordingVoice(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Error al acceder al micrófono:', err);
      alert('No se pudo acceder al micrófono. Por favor comprueba los permisos del navegador.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  // Añadir pista de audio desde el ordenador
  const handleAddAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => {
      const newTrack: AudioTrack = {
        id: `audio_${Date.now()}`,
        name: file.name,
        file,
        url,
        volume: 0.8,
        startTime: 0,
        duration: tempAudio.duration || 10,
      };
      setAudioTracks((prev) => [...prev, newTrack]);
    };
  };

  // Textos activos para el reproductor individual
  const activeClipTexts = useMemo(() => {
    if (!selectedClip) return [];
    // Tiempo relativo al inicio del recorte
    const relTime = currentTime - selectedClip.start;
    return selectedClip.texts.filter(
      (t) => relTime >= t.startTime && relTime <= t.endTime
    );
  }, [selectedClip, currentTime]);

  // Previsualización Global: control de reproducción continua
  useEffect(() => {
    let animationFrameId: number;

    const handleGlobalTick = () => {
      if (!isGlobalPlaying || clips.length === 0) return;

      const v = globalVideoRef.current;
      if (v) {
        const activeClip = clips[currentGlobalClipIndex];
        if (activeClip) {
          const clipTime = v.currentTime;
          // Calcular tiempo global acumulado
          let accumulatedBefore = 0;
          for (let i = 0; i < currentGlobalClipIndex; i++) {
            accumulatedBefore += Math.max(0, clips[i].end - clips[i].start);
          }
          const currentProgressInClip = Math.max(0, clipTime - activeClip.start);
          setGlobalCurrentTime(accumulatedBefore + currentProgressInClip);

          // Si el clip llega a su fin, pasar al siguiente
          if (clipTime >= activeClip.end) {
            if (currentGlobalClipIndex < clips.length - 1) {
              const nextIndex = currentGlobalClipIndex + 1;
              setCurrentGlobalClipIndex(nextIndex);
              v.src = clips[nextIndex].url;
              v.currentTime = clips[nextIndex].start;
              v.volume = clips[nextIndex].muted ? 0 : clips[nextIndex].volume;
              v.play().catch(() => {});
            } else {
              // Fin del montaje
              setIsGlobalPlaying(false);
              v.pause();
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(handleGlobalTick);
    };

    if (isGlobalPlaying) {
      animationFrameId = requestAnimationFrame(handleGlobalTick);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isGlobalPlaying, clips, currentGlobalClipIndex]);

  const toggleGlobalPlay = () => {
    const v = globalVideoRef.current;
    if (!v || clips.length === 0) return;

    if (isGlobalPlaying) {
      v.pause();
      setIsGlobalPlaying(false);
    } else {
      // Si estamos al final, reiniciar
      if (globalCurrentTime >= totalMontageDuration - 0.1) {
        setCurrentGlobalClipIndex(0);
        v.src = clips[0].url;
        v.currentTime = clips[0].start;
        setGlobalCurrentTime(0);
      }
      v.volume = clips[currentGlobalClipIndex]?.muted ? 0 : (clips[currentGlobalClipIndex]?.volume ?? 1);
      v.play().catch(() => {});
      setIsGlobalPlaying(true);
    }
  };

  // Textos activos en la previsualización global
  const activeGlobalTexts = useMemo(() => {
    if (clips.length === 0 || currentGlobalClipIndex >= clips.length) return [];
    const activeClip = clips[currentGlobalClipIndex];
    if (!activeClip || !globalVideoRef.current) return [];
    const relTime = globalVideoRef.current.currentTime - activeClip.start;
    return activeClip.texts.filter(
      (t) => relTime >= t.startTime && relTime <= t.endTime
    );
  }, [clips, currentGlobalClipIndex, globalCurrentTime]);

  // EXPORTACIÓN Y DESCARGA DEL VÍDEO COMPLETO (Canvas + Web Audio API + MediaRecorder)
  const exportFullMontage = async () => {
    if (clips.length === 0) {
      alert('Por favor añade al menos un corte de vídeo para exportar el montaje.');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Iniciando motor de renderizado y composición...');
    setExportedVideoUrl(null);
    cancelExportRef.current = false;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo inicializar el contexto 2D');

      // Audio Context para mezclar audios
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const audioDest = audioCtx.createMediaStreamDestination();

      // Cargar audios adicionales si existen
      for (const track of audioTracks) {
        try {
          const response = await fetch(track.url);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = track.volume;
          source.connect(gainNode);
          gainNode.connect(audioDest);
          source.start(track.startTime);
        } catch (e) {
          console.warn('No se pudo procesar la pista de audio:', track.name, e);
        }
      }

      // Combinar canvas stream + audio stream
      const canvasStream = canvas.captureStream(30);
      const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(combinedTracks);

      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 4000000,
      });

      const recordedChunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      recorder.start(100);

      // Elemento de vídeo oculto para decodificar
      const renderVideo = document.createElement('video');
      renderVideo.muted = false;
      renderVideo.playsInline = true;
      renderVideo.crossOrigin = 'anonymous';

      // Conectar audio del vídeo al AudioContext si no está silenciado
      try {
        const videoAudioSource = audioCtx.createMediaElementSource(renderVideo);
        const videoGain = audioCtx.createGain();
        videoAudioSource.connect(videoGain);
        videoGain.connect(audioDest);
        videoGain.connect(audioCtx.destination); // para evitar que quede suspendido
      } catch (err) {
        console.warn('No se pudo conectar audio directo del elemento de vídeo:', err);
      }

      let totalRenderedSeconds = 0;

      // Iterar por cada corte
      for (let i = 0; i < clips.length; i++) {
        if (cancelExportRef.current) break;

        const clip = clips[i];
        setExportStatusText(`Renderizando corte ${i + 1} de ${clips.length}: "${clip.name}"...`);

        renderVideo.src = clip.url;
        await new Promise((r) => {
          renderVideo.onloadeddata = r;
          renderVideo.load();
        });

        renderVideo.currentTime = clip.start;
        await new Promise((r) => {
          renderVideo.onseeked = r;
        });

        await renderVideo.play();

        const clipDuration = Math.max(0.2, clip.end - clip.start);

        // Bucle de renderizado del clip actual
        await new Promise<void>((resolve) => {
          const checkRenderFrame = () => {
            if (cancelExportRef.current) {
              renderVideo.pause();
              resolve();
              return;
            }

            const currentPos = renderVideo.currentTime;
            const elapsedInClip = currentPos - clip.start;

            // Dibujar frame de vídeo en Canvas
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(renderVideo, 0, 0, canvas.width, canvas.height);

            // Dibujar textos superpuestos activos en este instante
            const activeTexts = clip.texts.filter(
              (t) => elapsedInClip >= t.startTime && elapsedInClip <= t.endTime
            );

            for (const t of activeTexts) {
              ctx.save();
              const fontSizeScaled = Math.round(t.fontSize * (canvas.height / 540));
              ctx.font = `${t.fontWeight === 'bold' ? 'bold ' : ''}${fontSizeScaled}px sans-serif`;
              ctx.textAlign = t.textAlign;
              ctx.textBaseline = 'middle';

              const lines = t.text.split('\n');
              const lineHeight = fontSizeScaled * 1.3;
              const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
              const boxPaddingX = 24;
              const boxPaddingY = 16;
              const boxWidth = maxLineWidth + boxPaddingX * 2;
              const boxHeight = lines.length * lineHeight + boxPaddingY * 2;

              let posX = canvas.width / 2;
              let posY = canvas.height - 80;

              if (t.position === 'top') {
                posY = 80;
              } else if (t.position === 'center') {
                posY = canvas.height / 2;
              } else if (t.position === 'custom' && t.customX !== undefined && t.customY !== undefined) {
                posX = (t.customX / 100) * canvas.width;
                posY = (t.customY / 100) * canvas.height;
              }

              let boxX = posX - boxWidth / 2;
              if (t.textAlign === 'left') boxX = posX - boxPaddingX;
              if (t.textAlign === 'right') boxX = posX - boxWidth + boxPaddingX;
              const boxY = posY - boxHeight / 2;

              // Fondo de caja
              if (t.bgOpacity > 0) {
                ctx.fillStyle = t.bgColor;
                ctx.globalAlpha = t.bgOpacity;
                ctx.beginPath();
                ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10);
                ctx.fill();
                ctx.globalAlpha = 1.0;
              }

              // Borde destacado
              if (t.hasBorder) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 2;
                ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
              }

              // Dibujar líneas de texto
              ctx.fillStyle = t.textColor;
              lines.forEach((line, idx) => {
                const lineY = boxY + boxPaddingY + idx * lineHeight + lineHeight / 2;
                ctx.fillText(line, posX, lineY);
              });

              ctx.restore();
            }

            // Actualizar progreso
            const currentTotal = totalRenderedSeconds + Math.min(elapsedInClip, clipDuration);
            const progressPct = Math.min(99, Math.round((currentTotal / totalMontageDuration) * 100));
            setExportProgress(progressPct);

            if (currentPos >= clip.end || renderVideo.ended) {
              renderVideo.pause();
              totalRenderedSeconds += clipDuration;
              resolve();
            } else {
              requestAnimationFrame(checkRenderFrame);
            }
          };

          requestAnimationFrame(checkRenderFrame);
        });
      }

      if (cancelExportRef.current) {
        recorder.stop();
        audioCtx.close();
        setIsExporting(false);
        return;
      }

      setExportStatusText('Finalizando codificación y preparando archivo para descarga...');
      setExportProgress(100);

      recorder.onstop = () => {
        const finalBlob = new Blob(recordedChunks, { type: mimeType });
        const finalUrl = URL.createObjectURL(finalBlob);
        setExportedVideoUrl(finalUrl);
        setExportStatusText('¡Montaje completado con éxito!');

        // Descarga automática
        const a = document.createElement('a');
        a.href = finalUrl;
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        a.download = `montaje_tactico_sd_oyonesa_${dateStr}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        audioCtx.close();
      };

      recorder.stop();
    } catch (err: any) {
      console.error('Error durante la exportación:', err);
      alert(`Error al generar el montaje: ${err?.message || 'Error desconocido'}`);
      setIsExporting(false);
    }
  };

  return (
    <div className="creador-montajes-page">
      {/* Header */}
      <div className="montajes-header">
        <div className="montajes-header-title">
          <div className="montajes-header-icon">🎬</div>
          <div>
            <h1>Creador de montajes</h1>
            <p>
              Herramienta exclusiva de entrenadores: une cortes de vídeo, recórtalos, añade textos explicativos y pistas de audio.
            </p>
          </div>
        </div>
        <div className="montajes-stats-badges">
          <div className="montajes-stat-badge">
            <span className="stat-label">Total Cortes</span>
            <span className="stat-value">{clips.length}</span>
          </div>
          <div className="montajes-stat-badge">
            <span className="stat-label">Duración Montaje</span>
            <span className="stat-value">{formatSeconds(totalMontageDuration)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="montajes-tabs">
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'clips' ? 'active' : ''}`}
          onClick={() => setActiveTab('clips')}
        >
          ✂️ 1. Cortes y Recorte ({clips.length})
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'texts' ? 'active' : ''}`}
          onClick={() => setActiveTab('texts')}
          disabled={clips.length === 0}
        >
          📝 2. Textos y Rótulos ({selectedClip ? selectedClip.texts.length : 0})
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          🎙️ 3. Audios y Locución ({audioTracks.length})
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('preview');
            setIsGlobalPlaying(false);
            setGlobalCurrentTime(0);
            setCurrentGlobalClipIndex(0);
            if (globalVideoRef.current && clips.length > 0) {
              globalVideoRef.current.src = clips[0].url;
              globalVideoRef.current.currentTime = clips[0].start;
            }
          }}
          disabled={clips.length === 0}
        >
          👁️ 4. Vista Previa Montaje
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
          disabled={clips.length === 0}
        >
          🚀 5. Exportar y Descargar
        </button>
      </div>

      {/* Dropzone para cargar vídeos */}
      <div
        className={`montajes-dropzone ${isDraggingOver ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="video/*"
          multiple
          onChange={(e) => {
            if (e.target.files) handleAddVideoFiles(e.target.files);
          }}
        />
        <div className="dropzone-content">
          <span className="dropzone-icon">📁</span>
          <h3>Arrastra aquí tus cortes de vídeo o haz clic para seleccionarlos</h3>
          <p>Formatos compatibles: MP4, WebM, MOV, MKV. Puedes seleccionar varios archivos a la vez.</p>
          <span className="dropzone-btn">+ Cargar cortes desde el ordenador</span>
        </div>
      </div>

      {/* Línea de tiempo de clips (Timeline) */}
      {clips.length > 0 && (
        <div className="montajes-timeline-card">
          <div className="timeline-header">
            <h3>
              <span>🎞️ Línea de tiempo del montaje</span>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'normal' }}>
                (Arrastra o usa las flechas para reordenar el orden en el que se unirán los cortes)
              </small>
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="ctrl-btn"
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                onClick={() => {
                  if (confirm('¿Vaciar todos los cortes del montaje?')) {
                    setClips([]);
                    setSelectedClipId(null);
                  }
                }}
              >
                🗑️ Limpiar todo
              </button>
            </div>
          </div>

          <div className="timeline-clips-track">
            {clips.map((clip, index) => {
              const isSelected = clip.id === selectedClip?.id;
              const effectiveDuration = Math.max(0, clip.end - clip.start);
              return (
                <div
                  key={clip.id}
                  className={`timeline-clip-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedClipId(clip.id);
                    if (videoRef.current) {
                      videoRef.current.currentTime = clip.start;
                      setIsPlaying(false);
                    }
                  }}
                >
                  <div className="clip-index-badge">#{index + 1}</div>
                  <div className="clip-thumb-wrapper">
                    {clip.thumbnail ? (
                      <img src={clip.thumbnail} alt={clip.name} />
                    ) : (
                      <span className="clip-thumb-placeholder">📹</span>
                    )}
                    <span className="clip-duration-badge">{formatSeconds(effectiveDuration)}</span>
                  </div>
                  <div className="clip-card-body">
                    <span className="clip-card-name" title={clip.name}>
                      {clip.name}
                    </span>
                    <div className="clip-card-badges">
                      <span className="badge-tag">
                        [{formatSeconds(clip.start)} - {formatSeconds(clip.end)}]
                      </span>
                      {clip.texts.length > 0 && (
                        <span className="badge-tag has-texts">📝 {clip.texts.length}</span>
                      )}
                    </div>
                    <div className="clip-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="clip-mini-btn"
                        title="Mover a la izquierda"
                        disabled={index === 0}
                        onClick={() => moveClip(index, 'up')}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        className="clip-mini-btn"
                        title="Duplicar corte"
                        onClick={() => duplicateClip(clip)}
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        className="clip-mini-btn danger"
                        title="Eliminar corte"
                        onClick={() => removeClip(clip.id)}
                      >
                        🗑️
                      </button>
                      <button
                        type="button"
                        className="clip-mini-btn"
                        title="Mover a la derecha"
                        disabled={index === clips.length - 1}
                        onClick={() => moveClip(index, 'down')}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ÁREA PRINCIPAL: EDICIÓN DE CORTES, TEXTOS Y AUDIO */}
      {clips.length > 0 && selectedClip && (
        <>
          {activeTab === 'clips' && (
            <div className="montajes-workspace-grid">
              {/* Visor de Corte y Recorte */}
              <div className="video-player-card">
                <div className="video-container-relative">
                  <video
                    ref={videoRef}
                    src={selectedClip.url}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    playsInline
                  />
                  {/* Textos sobre el reproductor */}
                  {activeClipTexts.map((txt) => (
                    <div
                      key={txt.id}
                      className={`player-text-overlay pos-${txt.position}`}
                      style={
                        txt.position === 'custom' && txt.customX !== undefined && txt.customY !== undefined
                          ? { left: `${txt.customX}%`, top: `${txt.customY}%`, transform: 'translate(-50%, -50%)' }
                          : undefined
                      }
                    >
                      <div
                        className="text-box-render"
                        style={{
                          fontSize: `${txt.fontSize}px`,
                          color: txt.textColor,
                          backgroundColor: txt.bgColor,
                          opacity: txt.bgOpacity,
                          textAlign: txt.textAlign,
                          fontWeight: txt.fontWeight,
                          border: txt.hasBorder ? '2px solid rgba(255,255,255,0.4)' : 'none',
                        }}
                      >
                        {txt.text}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Controles de reproducción */}
                <div className="player-controls-bar">
                  <input
                    type="range"
                    className="player-timeline-slider"
                    min={0}
                    max={selectedClip.duration}
                    step={0.05}
                    value={currentTime}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      setCurrentTime(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                  />
                  <div className="player-buttons-row">
                    <div className="btn-group">
                      <button type="button" className="ctrl-btn primary" onClick={togglePlay}>
                        {isPlaying ? '⏸️ Pausar' : '▶️ Reproducir'}
                      </button>
                      <button type="button" className="ctrl-btn" onClick={playTrimmedRange}>
                        🔁 Reproducir recorte ({formatSeconds(selectedClip.start)} - {formatSeconds(selectedClip.end)})
                      </button>
                    </div>
                    <div className="time-display">
                      <span>{formatSeconds(currentTime)}</span> / <span>{formatSeconds(selectedClip.duration)}</span>
                    </div>
                  </div>
                </div>

                {/* Herramienta de Recorte (Trimming) */}
                <div className="trim-tool-card">
                  <div className="trim-header">
                    <h4>✂️ Recortar este corte ({selectedClip.name})</h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Ajusta los puntos de inicio y fin para quedarte sólo con la jugada clave
                    </span>
                  </div>

                  <div className="trim-controls-grid">
                    <div className="trim-input-group">
                      <label>Punto de Inicio (IN):</label>
                      <div className="trim-input-controls">
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          max={selectedClip.end - 0.1}
                          value={selectedClip.start}
                          onChange={(e) =>
                            updateSelectedClip({ start: Math.max(0, parseFloat(e.target.value) || 0) })
                          }
                        />
                        <button type="button" className="trim-mark-btn" onClick={markInPoint}>
                          📍 Fijar en pos. actual ({formatSeconds(currentTime)})
                        </button>
                      </div>
                    </div>

                    <div className="trim-input-group">
                      <label>Punto de Fin (OUT):</label>
                      <div className="trim-input-controls">
                        <input
                          type="number"
                          step={0.1}
                          min={selectedClip.start + 0.1}
                          max={selectedClip.duration}
                          value={selectedClip.end}
                          onChange={(e) =>
                            updateSelectedClip({
                              end: Math.min(selectedClip.duration, parseFloat(e.target.value) || selectedClip.duration),
                            })
                          }
                        />
                        <button type="button" className="trim-mark-btn" onClick={markOutPoint}>
                          🏁 Fijar en pos. actual ({formatSeconds(currentTime)})
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="trim-summary-bar">
                    <span>
                      Duración del recorte:{' '}
                      <strong style={{ color: 'var(--accent)' }}>
                        {formatSeconds(Math.max(0, selectedClip.end - selectedClip.start))}
                      </strong>
                    </span>
                    <button
                      type="button"
                      className="ctrl-btn"
                      style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                      onClick={() =>
                        updateSelectedClip({ start: 0, end: selectedClip.duration })
                      }
                    >
                      ↺ Restablecer corte completo
                    </button>
                  </div>
                </div>
              </div>

              {/* Panel lateral: Información y acciones rápidas */}
              <div className="side-editor-card">
                <div className="side-panel-header">
                  <h3>⚙️ Propiedades del corte</h3>
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nombre del corte:</label>
                    <input
                      type="text"
                      value={selectedClip.name}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        color: '#fff',
                        marginTop: 4,
                      }}
                      onChange={(e) => updateSelectedClip({ name: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.85rem' }}>Silenciar audio original de este corte:</label>
                    <input
                      type="checkbox"
                      checked={selectedClip.muted}
                      onChange={(e) => updateSelectedClip({ muted: e.target.checked })}
                    />
                  </div>

                  {!selectedClip.muted && (
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Volumen del audio original ({Math.round(selectedClip.volume * 100)}%):
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedClip.volume}
                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                        onChange={(e) => updateSelectedClip({ volume: parseFloat(e.target.value) })}
                      />
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      className="ctrl-btn primary"
                      style={{ justifyContent: 'center' }}
                      onClick={() => setActiveTab('texts')}
                    >
                      📝 Añadir textos explicativos a este corte ({selectedClip.texts.length})
                    </button>
                    <button
                      type="button"
                      className="ctrl-btn"
                      style={{ justifyContent: 'center' }}
                      onClick={() => duplicateClip(selectedClip)}
                    >
                      📋 Duplicar este corte para hacer otra toma
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA 2: TEXTOS Y RÓTULOS */}
          {activeTab === 'texts' && (
            <div className="montajes-workspace-grid">
              <div className="video-player-card">
                <div className="video-container-relative">
                  <video
                    ref={videoRef}
                    src={selectedClip.url}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    playsInline
                  />
                  {activeClipTexts.map((txt) => (
                    <div
                      key={txt.id}
                      className={`player-text-overlay pos-${txt.position}`}
                      style={
                        txt.position === 'custom' && txt.customX !== undefined && txt.customY !== undefined
                          ? { left: `${txt.customX}%`, top: `${txt.customY}%`, transform: 'translate(-50%, -50%)' }
                          : undefined
                      }
                    >
                      <div
                        className="text-box-render"
                        style={{
                          fontSize: `${txt.fontSize}px`,
                          color: txt.textColor,
                          backgroundColor: txt.bgColor,
                          opacity: txt.bgOpacity,
                          textAlign: txt.textAlign,
                          fontWeight: txt.fontWeight,
                          border: txt.hasBorder ? '2px solid rgba(255,255,255,0.4)' : 'none',
                        }}
                      >
                        {txt.text}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="player-controls-bar">
                  <input
                    type="range"
                    className="player-timeline-slider"
                    min={0}
                    max={selectedClip.duration}
                    step={0.05}
                    value={currentTime}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      setCurrentTime(t);
                      if (videoRef.current) videoRef.current.currentTime = t;
                    }}
                  />
                  <div className="player-buttons-row">
                    <button type="button" className="ctrl-btn primary" onClick={togglePlay}>
                      {isPlaying ? '⏸️ Pausar' : '▶️ Reproducir'}
                    </button>
                    <div className="time-display">
                      Posición en corte: <strong>{formatSeconds(Math.max(0, currentTime - selectedClip.start))}</strong> (total: {formatSeconds(selectedClip.end - selectedClip.start)})
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista y editor de textos */}
              <div className="side-editor-card">
                <div className="side-panel-header">
                  <h3>📝 Textos y rótulos en "{selectedClip.name}"</h3>
                  <button type="button" className="ctrl-btn primary" onClick={addTextOverlay}>
                    + Añadir texto
                  </button>
                </div>

                {selectedClip.texts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
                    <p>Aún no hay textos en este corte.</p>
                    <p style={{ fontSize: '0.85rem' }}>
                      Añade rótulos explicativos, flechas o instrucciones tácticas para tus jugadores.
                    </p>
                    <button type="button" className="ctrl-btn primary" onClick={addTextOverlay} style={{ marginTop: 10 }}>
                      + Crear primer rótulo
                    </button>
                  </div>
                ) : (
                  <div className="text-overlays-list">
                    {selectedClip.texts.map((txt, index) => {
                      const clipDuration = Math.max(0.5, selectedClip.end - selectedClip.start);
                      return (
                        <div key={txt.id} className="text-item-card">
                          <div className="text-item-header">
                            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Rótulo #{index + 1}</span>
                            <span className="text-item-timing">
                              {formatSeconds(txt.startTime)} ➔ {formatSeconds(txt.endTime)}
                            </span>
                            <button
                              type="button"
                              className="clip-mini-btn danger"
                              title="Eliminar texto"
                              onClick={() => removeTextOverlay(txt.id)}
                            >
                              🗑️
                            </button>
                          </div>

                          <div className="text-fields-grid">
                            <textarea
                              value={txt.text}
                              placeholder="Escribe aquí el texto que se mostrará en el vídeo..."
                              onChange={(e) => updateTextOverlay(txt.id, { text: e.target.value })}
                            />

                            <div className="text-style-row">
                              <label>
                                Inicio:
                                <input
                                  type="number"
                                  step={0.1}
                                  min={0}
                                  max={txt.endTime - 0.1}
                                  value={txt.startTime}
                                  onChange={(e) =>
                                    updateTextOverlay(txt.id, {
                                      startTime: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Fin:
                                <input
                                  type="number"
                                  step={0.1}
                                  min={txt.startTime + 0.1}
                                  max={clipDuration}
                                  value={txt.endTime}
                                  onChange={(e) =>
                                    updateTextOverlay(txt.id, {
                                      endTime: Math.min(clipDuration, parseFloat(e.target.value) || clipDuration),
                                    })
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="trim-mark-btn"
                                onClick={() => {
                                  const relTime = Math.max(0, currentTime - selectedClip.start);
                                  updateTextOverlay(txt.id, { startTime: Number(relTime.toFixed(1)) });
                                }}
                              >
                                📍 Iniciar aquí ({formatSeconds(Math.max(0, currentTime - selectedClip.start))})
                              </button>
                            </div>

                            <div className="text-style-row">
                              <label>
                                Posición:
                                <select
                                  value={txt.position}
                                  onChange={(e) =>
                                    updateTextOverlay(txt.id, { position: e.target.value as any })
                                  }
                                >
                                  <option value="bottom">Tercio Inferior (Abajo)</option>
                                  <option value="top">Superior (Arriba)</option>
                                  <option value="center">Centro</option>
                                  <option value="custom">Personalizada (X/Y)</option>
                                </select>
                              </label>

                              <label>
                                Tamaño:
                                <select
                                  value={txt.fontSize}
                                  onChange={(e) =>
                                    updateTextOverlay(txt.id, { fontSize: parseInt(e.target.value) })
                                  }
                                >
                                  <option value={20}>Pequeño (20px)</option>
                                  <option value={28}>Mediano (28px)</option>
                                  <option value={36}>Grande (36px)</option>
                                  <option value={48}>Extra Grande (48px)</option>
                                </select>
                              </label>

                              <label>
                                Texto:
                                <input
                                  type="color"
                                  value={txt.textColor}
                                  onChange={(e) => updateTextOverlay(txt.id, { textColor: e.target.value })}
                                />
                              </label>

                              <label>
                                Fondo:
                                <input
                                  type="color"
                                  value={txt.bgColor}
                                  onChange={(e) => updateTextOverlay(txt.id, { bgColor: e.target.value })}
                                />
                              </label>
                            </div>

                            {txt.position === 'custom' && (
                              <div className="text-style-row">
                                <label>
                                  Posición X ({txt.customX ?? 50}%):
                                  <input
                                    type="range"
                                    min={5}
                                    max={95}
                                    value={txt.customX ?? 50}
                                    onChange={(e) =>
                                      updateTextOverlay(txt.id, { customX: parseInt(e.target.value) })
                                    }
                                  />
                                </label>
                                <label>
                                  Posición Y ({txt.customY ?? 50}%):
                                  <input
                                    type="range"
                                    min={5}
                                    max={95}
                                    value={txt.customY ?? 50}
                                    onChange={(e) =>
                                      updateTextOverlay(txt.id, { customY: parseInt(e.target.value) })
                                    }
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PESTAÑA 3: AUDIOS Y LOCUCIÓN */}
          {activeTab === 'audio' && (
            <div className="audio-manager-card">
              <div className="montajes-workspace-grid">
                {/* Grabador de voz en off */}
                <div className="recorder-box">
                  <span style={{ fontSize: 32 }}>🎙️</span>
                  <h3 style={{ margin: 0 }}>Grabar locución / voz en off</h3>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    Narra las indicaciones tácticas de viva voz mientras visualizas los cortes.
                  </p>

                  {isRecordingVoice ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#eb5757', fontWeight: 800, fontSize: '1.4rem' }}>
                        ● Grabando: {formatSeconds(recordingSeconds)}
                      </span>
                      <button type="button" className="recorder-btn recording" onClick={stopVoiceRecording}>
                        ⏹️ Detener y guardar locución
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="recorder-btn" onClick={startVoiceRecording}>
                      🔴 Comenzar a grabar locución
                    </button>
                  )}
                </div>

                {/* Subir archivo de audio externo */}
                <div className="audio-track-box">
                  <div className="audio-track-header">
                    <h4>🎵 Subir archivo de audio o música</h4>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Carga un archivo de sonido (MP3, WAV, M4A, OGG) desde tu ordenador para insertarlo en el montaje.
                  </p>
                  <label className="file-upload-btn" style={{ textAlign: 'center' }}>
                    <span>+ Seleccionar archivo de audio</span>
                    <input type="file" accept="audio/*" onChange={handleAddAudioFile} />
                  </label>
                </div>
              </div>

              {/* Pistas de audio cargadas */}
              <div className="side-editor-card">
                <div className="side-panel-header">
                  <h3>Pistas de audio activas en el proyecto ({audioTracks.length})</h3>
                </div>

                {audioTracks.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px 0' }}>
                    No hay pistas de audio adicionales añadidas todavía.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {audioTracks.map((track) => (
                      <div key={track.id} className="audio-track-box">
                        <div className="audio-track-header">
                          <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                            {track.isVoiceOver ? '🎙️' : '🎵'} {track.name}
                          </span>
                          <button
                            type="button"
                            className="clip-mini-btn danger"
                            onClick={() => setAudioTracks((prev) => prev.filter((t) => t.id !== track.id))}
                          >
                            🗑️ Eliminar pista
                          </button>
                        </div>
                        <audio controls src={track.url} style={{ width: '100%', height: 36 }} />
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                          <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                            Volumen ({Math.round(track.volume * 100)}%):
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={track.volume}
                              style={{ accentColor: 'var(--accent)' }}
                              onChange={(e) => {
                                const vol = parseFloat(e.target.value);
                                setAudioTracks((prev) =>
                                  prev.map((t) => (t.id === track.id ? { ...t, volume: vol } : t))
                                );
                              }}
                            />
                          </label>
                          <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                            Comenzar en segundo:
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={track.startTime}
                              style={{
                                width: 70,
                                padding: '4px 6px',
                                background: 'var(--surface-1)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                color: '#fff',
                              }}
                              onChange={(e) => {
                                const st = Math.max(0, parseFloat(e.target.value) || 0);
                                setAudioTracks((prev) =>
                                  prev.map((t) => (t.id === track.id ? { ...t, startTime: st } : t))
                                );
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PESTAÑA 4: VISTA PREVIA MONTAJE GLOBAL */}
          {activeTab === 'preview' && (
            <div className="global-montage-container">
              <div className="side-panel-header">
                <h3>🎬 Previsualización completa de todo el montaje unido</h3>
                <span className="stat-value">{formatSeconds(totalMontageDuration)}</span>
              </div>

              <div className="video-container-relative">
                <video
                  ref={globalVideoRef}
                  playsInline
                />
                {/* Audio adicional */}
                <audio ref={globalAudioRef} />

                {/* Textos sobre el montaje completo */}
                {activeGlobalTexts.map((txt) => (
                  <div
                    key={txt.id}
                    className={`player-text-overlay pos-${txt.position}`}
                    style={
                      txt.position === 'custom' && txt.customX !== undefined && txt.customY !== undefined
                        ? { left: `${txt.customX}%`, top: `${txt.customY}%`, transform: 'translate(-50%, -50%)' }
                        : undefined
                    }
                  >
                    <div
                      className="text-box-render"
                      style={{
                        fontSize: `${txt.fontSize}px`,
                        color: txt.textColor,
                        backgroundColor: txt.bgColor,
                        opacity: txt.bgOpacity,
                        textAlign: txt.textAlign,
                        fontWeight: txt.fontWeight,
                        border: txt.hasBorder ? '2px solid rgba(255,255,255,0.4)' : 'none',
                      }}
                    >
                      {txt.text}
                    </div>
                  </div>
                ))}
              </div>

              {/* Segmentos visuales del montaje */}
              <div className="global-timeline-bar-wrapper">
                <div className="global-timeline-segments">
                  {clips.map((c, idx) => {
                    const dur = Math.max(0.1, c.end - c.start);
                    const pct = (dur / totalMontageDuration) * 100;
                    return (
                      <div
                        key={c.id}
                        className={`timeline-segment-block ${idx === currentGlobalClipIndex ? 'active' : ''}`}
                        style={{ width: `${pct}%` }}
                        onClick={() => {
                          setCurrentGlobalClipIndex(idx);
                          if (globalVideoRef.current) {
                            globalVideoRef.current.src = c.url;
                            globalVideoRef.current.currentTime = c.start;
                            globalVideoRef.current.volume = c.muted ? 0 : c.volume;
                          }
                        }}
                        title={`#${idx + 1}: ${c.name} (${formatSeconds(dur)})`}
                      >
                        #{idx + 1} {c.name}
                      </div>
                    );
                  })}
                  <div
                    className="global-playhead-indicator"
                    style={{
                      left: `${totalMontageDuration > 0 ? (globalCurrentTime / totalMontageDuration) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Controles de reproducción global */}
              <div className="player-buttons-row">
                <div className="btn-group">
                  <button type="button" className="ctrl-btn primary" onClick={toggleGlobalPlay}>
                    {isGlobalPlaying ? '⏸️ Pausar montaje' : '▶️ Reproducir montaje completo'}
                  </button>
                  <button
                    type="button"
                    className="ctrl-btn"
                    onClick={() => {
                      setCurrentGlobalClipIndex(0);
                      setGlobalCurrentTime(0);
                      if (globalVideoRef.current && clips[0]) {
                        globalVideoRef.current.src = clips[0].url;
                        globalVideoRef.current.currentTime = clips[0].start;
                        if (isGlobalPlaying) globalVideoRef.current.play();
                      }
                    }}
                  >
                    ⏮️ Reiniciar al principio
                  </button>
                </div>
                <div className="time-display">
                  Reproduciendo corte {currentGlobalClipIndex + 1} de {clips.length} (
                  <span>{formatSeconds(globalCurrentTime)}</span> / <span>{formatSeconds(totalMontageDuration)}</span>)
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA 5: EXPORTAR Y DESCARGAR */}
          {activeTab === 'export' && (
            <div className="global-montage-container" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div className="side-panel-header" style={{ width: '100%' }}>
                <h3>🚀 Exportar y descargar el vídeo completo</h3>
              </div>

              <div style={{ maxWidth: 640, padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ color: 'var(--text-muted)' }}>
                  Al pulsar el botón de exportación, el sistema unirá todos tus cortes ({clips.length} clips),
                  aplicará los recortes de inicio/fin, superpondrá los textos y fusionará todas las pistas de sonido en un solo archivo de vídeo descargable de alta calidad.
                </p>

                <div className="montajes-stat-badge" style={{ alignSelf: 'center', minWidth: 260 }}>
                  <span className="stat-label">Resumen del montaje</span>
                  <span className="stat-value" style={{ fontSize: '1rem', marginTop: 4 }}>
                    {clips.length} cortes • {formatSeconds(totalMontageDuration)} duración total
                  </span>
                </div>

                <button
                  type="button"
                  className="ctrl-btn primary"
                  style={{
                    padding: '16px 36px',
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    borderRadius: 14,
                    alignSelf: 'center',
                    marginTop: 10,
                  }}
                  onClick={exportFullMontage}
                  disabled={isExporting}
                >
                  🚀 Generar y Descargar Vídeo Unido
                </button>

                {exportedVideoUrl && (
                  <div className="export-success-box" style={{ marginTop: 20 }}>
                    <h4 style={{ margin: 0, color: 'var(--accent)' }}>✅ Vídeo generado correctamente</h4>
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>
                      Si la descarga no ha comenzado automáticamente, haz clic en el siguiente enlace:
                    </p>
                    <a
                      href={exportedVideoUrl}
                      download={`montaje_tactico_sd_oyonesa_${Date.now()}.webm`}
                      className="ctrl-btn primary"
                      style={{ alignSelf: 'center', padding: '8px 20px', textDecoration: 'none' }}
                    >
                      💾 Descargar archivo de vídeo (.webm)
                    </a>
                    <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden' }}>
                      <video src={exportedVideoUrl} controls style={{ width: '100%', maxHeight: 300 }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de progreso de exportación */}
      {isExporting && (
        <div className="export-modal-overlay">
          <div className="export-modal-content">
            <div className="export-progress-circle-wrap">
              <svg viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="8"
                  strokeDasharray={264}
                  strokeDashoffset={264 - (264 * exportProgress) / 100}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.2s ease' }}
                />
              </svg>
              <span className="export-progress-value">{exportProgress}%</span>
            </div>

            <div className="export-status-info">
              <h3>Uniendo y procesando cortes...</h3>
              <p>{exportStatusText}</p>
            </div>

            <button
              type="button"
              className="ctrl-btn"
              style={{ color: '#ff5e62', borderColor: 'rgba(255, 94, 98, 0.4)' }}
              onClick={() => {
                cancelExportRef.current = true;
                setIsExporting(false);
              }}
            >
              Cancelar exportación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
