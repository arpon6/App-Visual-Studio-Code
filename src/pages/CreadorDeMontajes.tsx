import { useEffect, useMemo, useRef, useState } from 'react';
import './CreadorDeMontajes.css';
import {
  deleteProjectFromDB,
  getAllProjects,
  getLastActiveProjectId,
  getProject,
  saveProjectToDB,
  setLastActiveProjectId,
  type ProjectSummary,
  type SavedProject,
} from '../lib/montajesStorage';

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
  file?: File | Blob;
  url: string;
  volume: number;      // 0 a 1
  startTime: number;   // segundo de inicio relativo al montaje global
  duration: number;
  isVoiceOver?: boolean;
};

export type MediaClip = {
  id: string;
  type: 'video' | 'image';
  name: string;
  file: File | Blob;
  url: string;
  duration: number;    // duración total (para vídeo: metadata; para imagen: tiempo en pantalla)
  start: number;       // punto In del recorte (para imagen: 0)
  end: number;         // punto Out del recorte (para imagen: duration)
  volume: number;      // 0 a 1 (vídeo)
  muted: boolean;
  texts: TextOverlay[];
  thumbnail?: string;
};

type ActiveTab = 'projects' | 'clips' | 'texts' | 'audio' | 'preview' | 'export';

function formatSeconds(secs: number): string {
  if (isNaN(secs) || secs < 0) secs = 0;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}

export default function CreadorDeMontajes() {
  // Estado del Proyecto
  const [projectId, setProjectId] = useState<string>(() => `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
  const [projectName, setProjectName] = useState<string>('Nuevo Montaje Táctico');
  const [isSaved, setIsSaved] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedProjectsList, setSavedProjectsList] = useState<ProjectSummary[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const [clips, setClips] = useState<MediaClip[]>([]);
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

  // Simulación de reproducción para fotos en el visor individual
  const photoTimerRef = useRef<number | null>(null);

  // Previsualización global
  const globalVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);
  const [globalCurrentTime, setGlobalCurrentTime] = useState(0);
  const [currentGlobalClipIndex, setCurrentGlobalClipIndex] = useState(0);
  const globalPhotoStartTimeRef = useRef<number>(0);

  // Exportación
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const cancelExportRef = useRef(false);

  // Marcar cambios sin guardar cuando se editan clips o pistas
  const markUnsaved = () => {
    setIsSaved(false);
  };

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

  // Cargar lista de proyectos y restaurar el último activo al iniciar
  useEffect(() => {
    const initProjects = async () => {
      try {
        const summaries = await getAllProjects();
        setSavedProjectsList(summaries);

        const lastActiveId = getLastActiveProjectId();
        if (lastActiveId) {
          const loaded = await getProject(lastActiveId);
          if (loaded) {
            applyLoadedProject(loaded);
            return;
          }
        }

        // Si hay proyectos y ninguno activo, si el usuario no tiene clips, cargar el más reciente
        if (summaries.length > 0) {
          const loaded = await getProject(summaries[0].id);
          if (loaded) applyLoadedProject(loaded);
        }
      } catch (err) {
        console.error('Error al inicializar proyectos de montajes:', err);
      }
    };
    initProjects();
  }, []);

  // Función para aplicar un proyecto recuperado de IndexedDB
  const applyLoadedProject = (p: SavedProject) => {
    setProjectId(p.id);
    setProjectName(p.name);

    const hydratedClips: MediaClip[] = (p.clips || []).map((c) => {
      const url = URL.createObjectURL(c.blob);
      return {
        id: c.id,
        type: c.type,
        name: c.name,
        file: c.blob,
        url,
        duration: c.duration,
        start: c.start,
        end: c.end,
        volume: c.volume,
        muted: c.muted,
        texts: c.texts || [],
        thumbnail: c.thumbnail || (c.type === 'image' ? url : undefined),
      };
    });

    const hydratedAudios: AudioTrack[] = (p.audioTracks || []).map((a) => {
      const url = a.blob ? URL.createObjectURL(a.blob) : '';
      return {
        id: a.id,
        name: a.name,
        file: a.blob,
        url,
        volume: a.volume,
        startTime: a.startTime,
        duration: a.duration,
        isVoiceOver: a.isVoiceOver,
      };
    });

    setClips(hydratedClips);
    setAudioTracks(hydratedAudios);
    if (hydratedClips.length > 0) {
      setSelectedClipId(hydratedClips[0].id);
    }
    setIsSaved(true);
    setLastActiveProjectId(p.id);
  };

  // Guardar proyecto actual en IndexedDB
  const handleSaveProject = async () => {
    setIsSaving(true);
    try {
      // Convertir audios en blobs si es necesario
      const savedAudioTracks = await Promise.all(
        audioTracks.map(async (track) => {
          let blob = track.file as Blob | undefined;
          if (!blob && track.url) {
            try {
              const res = await fetch(track.url);
              blob = await res.blob();
            } catch (e) {
              console.warn('No se pudo guardar blob de pista:', track.name, e);
            }
          }
          return {
            id: track.id,
            name: track.name,
            blob,
            volume: track.volume,
            startTime: track.startTime,
            duration: track.duration,
            isVoiceOver: track.isVoiceOver,
          };
        })
      );

      const savedClips = clips.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        blob: c.file as Blob,
        duration: c.duration,
        start: c.start,
        end: c.end,
        volume: c.volume,
        muted: c.muted,
        texts: c.texts,
        thumbnail: c.thumbnail,
      }));

      const now = new Date().toISOString();
      const projectData: SavedProject = {
        id: projectId,
        name: projectName.trim() || 'Montaje Táctico',
        createdAt: now,
        updatedAt: now,
        thumbnail: clips[0]?.thumbnail,
        totalDuration: totalMontageDuration,
        clipsCount: clips.length,
        clips: savedClips,
        audioTracks: savedAudioTracks,
      };

      await saveProjectToDB(projectData);
      setIsSaved(true);
      setSaveFeedback('¡Proyecto guardado con éxito!');
      setTimeout(() => setSaveFeedback(null), 3000);

      // Actualizar lista
      const list = await getAllProjects();
      setSavedProjectsList(list);
    } catch (err: any) {
      console.error('Error al guardar el proyecto:', err);
      alert(`No se pudo guardar el proyecto: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Crear nuevo proyecto limpio
  const handleCreateNewProject = () => {
    if (!isSaved && clips.length > 0) {
      if (!confirm('Tienes cambios sin guardar en el proyecto actual. ¿Deseas crear un nuevo proyecto de todas formas?')) {
        return;
      }
    }

    const newId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setProjectId(newId);
    setProjectName(`Montaje Táctico ${savedProjectsList.length + 1}`);
    setClips([]);
    setSelectedClipId(null);
    setAudioTracks([]);
    setIsSaved(true);
    setLastActiveProjectId(newId);
    setActiveTab('clips');
  };

  // Cargar un proyecto seleccionado de la lista
  const handleLoadProject = async (id: string) => {
    if (!isSaved && clips.length > 0) {
      if (!confirm('Tienes cambios sin guardar en el proyecto actual. ¿Deseas abrir otro proyecto?')) {
        return;
      }
    }

    try {
      const p = await getProject(id);
      if (p) {
        applyLoadedProject(p);
        setActiveTab('clips');
        setSaveFeedback(`Proyecto "${p.name}" cargado`);
        setTimeout(() => setSaveFeedback(null), 2500);
      }
    } catch (e) {
      console.error('Error al abrir el proyecto:', e);
      alert('No se pudo cargar el proyecto seleccionado.');
    }
  };

  // Eliminar un proyecto
  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`¿Seguro que deseas eliminar el proyecto "${name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await deleteProjectFromDB(id);
      const list = await getAllProjects();
      setSavedProjectsList(list);

      // Si se elimina el proyecto que estaba abierto
      if (id === projectId) {
        handleCreateNewProject();
      }
    } catch (e) {
      console.error('Error al eliminar proyecto:', e);
      alert('Error al eliminar el proyecto.');
    }
  };

  // Generar miniatura de vídeo
  const generateVideoThumbnail = (file: File | Blob): Promise<string> => {
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

  // Cargar archivos (vídeos o fotos) desde el ordenador
  const handleAddMediaFiles = async (files: FileList | File[]) => {
    const newClips: MediaClip[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) continue;

      const url = URL.createObjectURL(file);

      if (isVideo) {
        // Obtener duración de vídeo
        const duration = await new Promise<number>((resolve) => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.src = url;
          v.onloadedmetadata = () => resolve(v.duration || 5);
          v.onerror = () => resolve(5);
        });

        const thumbnail = await generateVideoThumbnail(file);

        const clip: MediaClip = {
          id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: 'video',
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
      } else if (isImage) {
        const defaultDuration = 4.0;
        const clip: MediaClip = {
          id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: 'image',
          name: file.name.replace(/\.[^/.]+$/, ''),
          file,
          url,
          duration: defaultDuration,
          start: 0,
          end: defaultDuration,
          volume: 0,
          muted: true,
          texts: [],
          thumbnail: url,
        };
        newClips.push(clip);
      }
    }

    if (newClips.length > 0) {
      setClips((prev) => {
        const updated = [...prev, ...newClips];
        if (!selectedClipId) setSelectedClipId(updated[0].id);
        return updated;
      });
      markUnsaved();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddMediaFiles(e.dataTransfer.files);
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
    markUnsaved();
  };

  const duplicateClip = (clip: MediaClip) => {
    const newClip: MediaClip = {
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
    markUnsaved();
  };

  const removeClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    markUnsaved();
  };

  // Ajustes de corte seleccionado
  const updateSelectedClip = (patch: Partial<MediaClip>) => {
    if (!selectedClip) return;
    setClips((prev) =>
      prev.map((c) => (c.id === selectedClip.id ? { ...c, ...patch } : c))
    );
    markUnsaved();
  };

  // Control de reproducción individual
  const togglePlay = () => {
    if (!selectedClip) return;

    if (selectedClip.type === 'video') {
      if (!videoRef.current) return;
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      if (isPlaying) {
        if (photoTimerRef.current) clearInterval(photoTimerRef.current);
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
        if (currentTime >= selectedClip.duration) {
          setCurrentTime(0);
        }
        const interval = 100;
        photoTimerRef.current = window.setInterval(() => {
          setCurrentTime((prev) => {
            const next = prev + 0.1;
            if (next >= selectedClip.duration) {
              clearInterval(photoTimerRef.current!);
              setIsPlaying(false);
              return selectedClip.duration;
            }
            return next;
          });
        }, interval);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (photoTimerRef.current) clearInterval(photoTimerRef.current);
    };
  }, []);

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !selectedClip || selectedClip.type !== 'video') return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    if (time >= selectedClip.end) {
      videoRef.current.pause();
      videoRef.current.currentTime = selectedClip.start;
      setIsPlaying(false);
    }
  };

  const playTrimmedRange = () => {
    if (!selectedClip) return;
    if (selectedClip.type === 'video' && videoRef.current) {
      videoRef.current.currentTime = selectedClip.start;
      videoRef.current.play();
      setIsPlaying(true);
    } else if (selectedClip.type === 'image') {
      setCurrentTime(0);
      togglePlay();
    }
  };

  const markInPoint = () => {
    if (!videoRef.current || !selectedClip || selectedClip.type !== 'video') return;
    const now = videoRef.current.currentTime;
    const newStart = Math.min(now, selectedClip.end - 0.2);
    updateSelectedClip({ start: Math.max(0, Number(newStart.toFixed(2))) });
  };

  const markOutPoint = () => {
    if (!videoRef.current || !selectedClip || selectedClip.type !== 'video') return;
    const now = videoRef.current.currentTime;
    const newEnd = Math.max(now, selectedClip.start + 0.2);
    updateSelectedClip({ end: Math.min(selectedClip.duration, Number(newEnd.toFixed(2))) });
  };

  // Modificar duración de foto
  const handleSetPhotoDuration = (newSecs: number) => {
    if (!selectedClip || selectedClip.type !== 'image') return;
    const val = Math.max(0.5, Math.min(60, Number(newSecs.toFixed(1))));
    updateSelectedClip({ duration: val, start: 0, end: val });
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
          file: audioBlob,
          url: audioUrl,
          volume: 1,
          startTime: 0,
          duration,
          isVoiceOver: true,
        };
        setAudioTracks((prev) => [...prev, newTrack]);
        markUnsaved();
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
      markUnsaved();
    };
  };

  // Textos activos para el reproductor individual
  const activeClipTexts = useMemo(() => {
    if (!selectedClip) return [];
    const relTime = currentTime - selectedClip.start;
    return selectedClip.texts.filter(
      (t) => relTime >= t.startTime && relTime <= t.endTime
    );
  }, [selectedClip, currentTime]);

  // Previsualización Global: control de reproducción continua (Vídeos + Fotos)
  useEffect(() => {
    let animationFrameId: number;

    const handleGlobalTick = () => {
      if (!isGlobalPlaying || clips.length === 0) return;

      const activeClip = clips[currentGlobalClipIndex];
      if (activeClip) {
        let clipProgress = 0;
        const activeClipDuration = Math.max(0.1, activeClip.end - activeClip.start);

        if (activeClip.type === 'video') {
          const v = globalVideoRef.current;
          if (v) {
            clipProgress = Math.max(0, v.currentTime - activeClip.start);
            if (v.currentTime >= activeClip.end) {
              advanceToNextGlobalClip();
              return;
            }
          }
        } else {
          const elapsed = (performance.now() - globalPhotoStartTimeRef.current) / 1000;
          clipProgress = Math.min(elapsed, activeClipDuration);
          if (elapsed >= activeClipDuration) {
            advanceToNextGlobalClip();
            return;
          }
        }

        let accumulatedBefore = 0;
        for (let i = 0; i < currentGlobalClipIndex; i++) {
          accumulatedBefore += Math.max(0, clips[i].end - clips[i].start);
        }
        setGlobalCurrentTime(accumulatedBefore + clipProgress);
      }

      animationFrameId = requestAnimationFrame(handleGlobalTick);
    };

    const advanceToNextGlobalClip = () => {
      if (currentGlobalClipIndex < clips.length - 1) {
        const nextIndex = currentGlobalClipIndex + 1;
        setCurrentGlobalClipIndex(nextIndex);
        const nextClip = clips[nextIndex];

        if (nextClip.type === 'video') {
          const v = globalVideoRef.current;
          if (v) {
            v.src = nextClip.url;
            v.currentTime = nextClip.start;
            v.volume = nextClip.muted ? 0 : nextClip.volume;
            v.play().catch(() => {});
          }
        } else {
          globalPhotoStartTimeRef.current = performance.now();
        }
      } else {
        setIsGlobalPlaying(false);
        if (globalVideoRef.current) globalVideoRef.current.pause();
      }
    };

    if (isGlobalPlaying) {
      animationFrameId = requestAnimationFrame(handleGlobalTick);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isGlobalPlaying, clips, currentGlobalClipIndex]);

  const toggleGlobalPlay = () => {
    if (clips.length === 0) return;

    if (isGlobalPlaying) {
      if (globalVideoRef.current) globalVideoRef.current.pause();
      setIsGlobalPlaying(false);
    } else {
      let targetIndex = currentGlobalClipIndex;
      if (globalCurrentTime >= totalMontageDuration - 0.1) {
        targetIndex = 0;
        setCurrentGlobalClipIndex(0);
        setGlobalCurrentTime(0);
      }

      const activeClip = clips[targetIndex];
      if (activeClip) {
        if (activeClip.type === 'video' && globalVideoRef.current) {
          globalVideoRef.current.src = activeClip.url;
          globalVideoRef.current.currentTime = activeClip.start;
          globalVideoRef.current.volume = activeClip.muted ? 0 : activeClip.volume;
          globalVideoRef.current.play().catch(() => {});
        } else if (activeClip.type === 'image') {
          globalPhotoStartTimeRef.current = performance.now();
        }
      }
      setIsGlobalPlaying(true);
    }
  };

  // Textos activos en la previsualización global
  const activeGlobalTexts = useMemo(() => {
    if (clips.length === 0 || currentGlobalClipIndex >= clips.length) return [];
    const activeClip = clips[currentGlobalClipIndex];
    if (!activeClip) return [];

    let relTime = 0;
    if (activeClip.type === 'video' && globalVideoRef.current) {
      relTime = globalVideoRef.current.currentTime - activeClip.start;
    } else {
      let accumulatedBefore = 0;
      for (let i = 0; i < currentGlobalClipIndex; i++) {
        accumulatedBefore += Math.max(0, clips[i].end - clips[i].start);
      }
      relTime = Math.max(0, globalCurrentTime - accumulatedBefore);
    }

    return activeClip.texts.filter(
      (t) => relTime >= t.startTime && relTime <= t.endTime
    );
  }, [clips, currentGlobalClipIndex, globalCurrentTime]);

  // Helper para dibujar textos sobre Canvas
  const drawTextOverlays = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    texts: TextOverlay[],
    elapsedInClip: number
  ) => {
    const activeTexts = texts.filter(
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
  };

  // EXPORTACIÓN EN FORMATO MP4 (.mp4)
  const exportFullMontage = async () => {
    if (clips.length === 0) {
      alert('Por favor añade al menos un corte de vídeo o foto para exportar el montaje.');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Iniciando motor de renderizado y composición MP4...');
    setExportedVideoUrl(null);
    cancelExportRef.current = false;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo inicializar el contexto 2D');

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const audioDest = audioCtx.createMediaStreamDestination();

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

      const canvasStream = canvas.captureStream(30);
      const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(combinedTracks);

      const mp4Mimes = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];

      const chosenMime = mp4Mimes.find((mime) => MediaRecorder.isTypeSupported(mime)) || 'video/mp4';

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: chosenMime,
        videoBitsPerSecond: 5000000,
      });

      const recordedChunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      recorder.start(100);

      const renderVideo = document.createElement('video');
      renderVideo.muted = false;
      renderVideo.playsInline = true;
      renderVideo.crossOrigin = 'anonymous';

      try {
        const videoAudioSource = audioCtx.createMediaElementSource(renderVideo);
        const videoGain = audioCtx.createGain();
        videoAudioSource.connect(videoGain);
        videoGain.connect(audioDest);
        videoGain.connect(audioCtx.destination);
      } catch (err) {
        console.warn('No se pudo conectar audio directo del elemento de vídeo:', err);
      }

      let totalRenderedSeconds = 0;

      for (let i = 0; i < clips.length; i++) {
        if (cancelExportRef.current) break;

        const clip = clips[i];
        setExportStatusText(
          `Renderizando elemento ${i + 1} de ${clips.length} (${clip.type === 'image' ? 'Foto' : 'Vídeo'}): "${clip.name}"...`
        );

        const clipDuration = Math.max(0.2, clip.end - clip.start);

        if (clip.type === 'video') {
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

          await new Promise<void>((resolve) => {
            const checkRenderFrame = () => {
              if (cancelExportRef.current) {
                renderVideo.pause();
                resolve();
                return;
              }

              const currentPos = renderVideo.currentTime;
              const elapsedInClip = currentPos - clip.start;

              ctx.fillStyle = '#000';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(renderVideo, 0, 0, canvas.width, canvas.height);

              drawTextOverlays(ctx, canvas, clip.texts, elapsedInClip);

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
        } else if (clip.type === 'image') {
          const img = new Image();
          img.src = clip.url;
          await new Promise((r) => {
            img.onload = r;
          });

          const fps = 30;
          const totalFrames = Math.max(1, Math.round(clipDuration * fps));
          const frameIntervalMs = 1000 / fps;

          for (let frame = 0; frame < totalFrames; frame++) {
            if (cancelExportRef.current) break;

            const elapsedInClip = frame / fps;

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const hRatio = canvas.width / img.width;
            const vRatio = canvas.height / img.height;
            const ratio = Math.min(hRatio, vRatio);
            const centerShiftX = (canvas.width - img.width * ratio) / 2;
            const centerShiftY = (canvas.height - img.height * ratio) / 2;
            ctx.drawImage(
              img,
              0,
              0,
              img.width,
              img.height,
              centerShiftX,
              centerShiftY,
              img.width * ratio,
              img.height * ratio
            );

            drawTextOverlays(ctx, canvas, clip.texts, elapsedInClip);

            const currentTotal = totalRenderedSeconds + elapsedInClip;
            const progressPct = Math.min(99, Math.round((currentTotal / totalMontageDuration) * 100));
            setExportProgress(progressPct);

            await new Promise((r) => setTimeout(r, frameIntervalMs));
          }

          totalRenderedSeconds += clipDuration;
        }
      }

      if (cancelExportRef.current) {
        recorder.stop();
        audioCtx.close();
        setIsExporting(false);
        return;
      }

      setExportStatusText('Finalizando codificación y generando archivo .mp4...');
      setExportProgress(100);

      recorder.onstop = () => {
        const finalBlob = new Blob(recordedChunks, { type: 'video/mp4' });
        const finalUrl = URL.createObjectURL(finalBlob);
        setExportedVideoUrl(finalUrl);
        setExportStatusText('¡Montaje en formato .mp4 completado con éxito!');

        const a = document.createElement('a');
        a.href = finalUrl;
        const now = new Date();
        const cleanName = (projectName || 'montaje_tactico').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        a.download = `${cleanName}_${dateStr}.mp4`;
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
              Herramienta exclusiva de entrenadores: guarda tus proyectos, une vídeos y fotos, recórtalos, añade rótulos y audios, y exporta en <strong>.MP4</strong>.
            </p>
          </div>
        </div>
        <div className="montajes-stats-badges">
          <div className="montajes-stat-badge">
            <span className="stat-label">Total Elementos</span>
            <span className="stat-value">{clips.length}</span>
          </div>
          <div className="montajes-stat-badge">
            <span className="stat-label">Duración Montaje</span>
            <span className="stat-value">{formatSeconds(totalMontageDuration)}</span>
          </div>
        </div>
      </div>

      {/* Barra de Proyecto: Título, estado y acciones de guardado */}
      <div className="montajes-project-bar">
        <div className="project-name-group">
          <label>📁 Proyecto:</label>
          <input
            type="text"
            className="project-name-input"
            value={projectName}
            placeholder="Escribe el nombre del montaje..."
            onChange={(e) => {
              setProjectName(e.target.value);
              markUnsaved();
            }}
          />
          <span className={`project-save-status ${isSaved ? 'saved' : 'unsaved'}`}>
            {isSaving ? 'Guardando...' : isSaved ? '✓ Guardado' : '● Sin guardar'}
          </span>
          {saveFeedback && (
            <span style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>
              {saveFeedback}
            </span>
          )}
        </div>

        <div className="project-actions-group">
          <button
            type="button"
            className="ctrl-btn primary"
            onClick={handleSaveProject}
            disabled={isSaving}
          >
            💾 Guardar proyecto
          </button>
          <button
            type="button"
            className="ctrl-btn"
            onClick={handleCreateNewProject}
          >
            ➕ Nuevo proyecto
          </button>
          <button
            type="button"
            className={`ctrl-btn ${activeTab === 'projects' ? 'primary' : ''}`}
            onClick={() => setActiveTab(activeTab === 'projects' ? 'clips' : 'projects')}
          >
            📂 Mis Proyectos ({savedProjectsList.length})
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="montajes-tabs">
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          📂 1. Mis Proyectos ({savedProjectsList.length})
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'clips' ? 'active' : ''}`}
          onClick={() => setActiveTab('clips')}
        >
          ✂️ 2. Cortes y Fotos ({clips.length})
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'texts' ? 'active' : ''}`}
          onClick={() => setActiveTab('texts')}
          disabled={clips.length === 0}
        >
          📝 3. Textos y Rótulos ({selectedClip ? selectedClip.texts.length : 0})
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          🎙️ 4. Audios y Locución ({audioTracks.length})
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('preview');
            setIsGlobalPlaying(false);
            setGlobalCurrentTime(0);
            setCurrentGlobalClipIndex(0);
            if (clips[0]?.type === 'video' && globalVideoRef.current) {
              globalVideoRef.current.src = clips[0].url;
              globalVideoRef.current.currentTime = clips[0].start;
            }
          }}
          disabled={clips.length === 0}
        >
          👁️ 5. Vista Previa Montaje
        </button>
        <button
          type="button"
          className={`montajes-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
          disabled={clips.length === 0}
        >
          🚀 6. Exportar en .MP4
        </button>
      </div>

      {/* PESTAÑA: GESTOR DE PROYECTOS GUARDADOS */}
      {activeTab === 'projects' && (
        <div className="projects-gallery-container">
          <div className="projects-gallery-header">
            <div>
              <h3>📂 Galería de proyectos guardados</h3>
              <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Todos los vídeos, fotos, recortes y locuciones quedan guardados en el navegador para que puedas retomarlos cuando quieras.
              </p>
            </div>
            <button type="button" className="ctrl-btn primary" onClick={handleCreateNewProject}>
              ➕ Crear nuevo montaje desde cero
            </button>
          </div>

          {savedProjectsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 44 }}>📁</span>
              <p style={{ marginTop: 10, fontSize: '1.1rem' }}>No tienes ningún proyecto guardado aún.</p>
              <p style={{ fontSize: '0.88rem' }}>
                Añade cortes o fotos en la pestaña "Cortes y Fotos" y pulsa "Guardar proyecto" para conservarlo.
              </p>
            </div>
          ) : (
            <div className="projects-grid">
              {savedProjectsList.map((p) => {
                const isActive = p.id === projectId;
                const formattedDate = new Date(p.updatedAt).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div key={p.id} className={`project-card ${isActive ? 'active-project' : ''}`}>
                    <div className="project-card-thumb-wrap">
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt={p.name} />
                      ) : (
                        <span className="project-card-thumb-placeholder">🎬</span>
                      )}
                      {isActive && <span className="project-active-badge">ACTIVO EN EDICIÓN</span>}
                    </div>

                    <div className="project-card-body">
                      <h4 className="project-card-title" title={p.name}>{p.name}</h4>
                      <div className="project-card-meta">
                        <span>🕒 Modificado: {formattedDate}</span>
                        <div className="project-card-stats">
                          <span>🎞️ {p.clipsCount} {p.clipsCount === 1 ? 'elemento' : 'elementos'}</span>
                          <span>⏱️ {formatSeconds(p.totalDuration)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="project-card-actions">
                      <button
                        type="button"
                        className={`ctrl-btn ${isActive ? 'primary' : ''}`}
                        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                        onClick={() => handleLoadProject(p.id)}
                      >
                        {isActive ? '✏️ Editando' : '📂 Abrir'}
                      </button>
                      <button
                        type="button"
                        className="clip-mini-btn danger"
                        style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                        title="Eliminar proyecto"
                        onClick={() => handleDeleteProject(p.id, p.name)}
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Dropzone para cargar vídeos y fotos */}
      {activeTab === 'clips' && (
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
            accept="video/*,image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) handleAddMediaFiles(e.target.files);
            }}
          />
          <div className="dropzone-content">
            <span className="dropzone-icon">📁</span>
            <h3>Arrastra aquí tus cortes de vídeo o fotos, o haz clic para seleccionarlos</h3>
            <p>
              Formatos compatibles: Vídeos (MP4, WebM, MOV, MKV) e Imágenes (JPG, PNG, WebP). Puedes añadir y mezclar ambos.
            </p>
            <span className="dropzone-btn">+ Cargar vídeos o fotos desde el ordenador</span>
          </div>
        </div>
      )}

      {/* Línea de tiempo de clips (Timeline) */}
      {clips.length > 0 && activeTab !== 'projects' && (
        <div className="montajes-timeline-card">
          <div className="timeline-header">
            <h3>
              <span>🎞️ Línea de tiempo del montaje</span>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'normal' }}>
                (Arrastra o usa las flechas para reordenar el orden en el que se unirán los vídeos y fotos)
              </small>
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="ctrl-btn"
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                onClick={() => {
                  if (confirm('¿Vaciar todos los elementos del montaje?')) {
                    setClips([]);
                    setSelectedClipId(null);
                    markUnsaved();
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
                    setCurrentTime(clip.type === 'video' ? clip.start : 0);
                    if (videoRef.current && clip.type === 'video') {
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
                      <span className="clip-thumb-placeholder">
                        {clip.type === 'image' ? '🖼️' : '📹'}
                      </span>
                    )}
                    <span className="clip-duration-badge">{formatSeconds(effectiveDuration)}</span>
                  </div>
                  <div className="clip-card-body">
                    <span className="clip-card-name" title={clip.name}>
                      {clip.name}
                    </span>
                    <div className="clip-card-badges">
                      <span className={`badge-tag ${clip.type === 'image' ? 'type-photo' : 'type-video'}`}>
                        {clip.type === 'image' ? '📷 FOTO' : '🎬 VÍDEO'}
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
                        title="Duplicar elemento"
                        onClick={() => duplicateClip(clip)}
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        className="clip-mini-btn danger"
                        title="Eliminar elemento"
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

      {/* ÁREA PRINCIPAL: EDICIÓN DE CORTES, FOTOS, TEXTOS Y AUDIO */}
      {clips.length > 0 && selectedClip && (
        <>
          {activeTab === 'clips' && (
            <div className="montajes-workspace-grid">
              {/* Visor de Elemento (Vídeo o Foto) */}
              <div className="video-player-card">
                <div className="video-container-relative">
                  {selectedClip.type === 'video' ? (
                    <video
                      ref={videoRef}
                      src={selectedClip.url}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onEnded={() => setIsPlaying(false)}
                      playsInline
                    />
                  ) : (
                    <img
                      src={selectedClip.url}
                      alt={selectedClip.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  )}

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
                      if (selectedClip.type === 'video' && videoRef.current) {
                        videoRef.current.currentTime = t;
                      }
                    }}
                  />
                  <div className="player-buttons-row">
                    <div className="btn-group">
                      <button type="button" className="ctrl-btn primary" onClick={togglePlay}>
                        {isPlaying ? '⏸️ Pausar' : '▶️ Reproducir'}
                      </button>
                      <button type="button" className="ctrl-btn" onClick={playTrimmedRange}>
                        {selectedClip.type === 'video'
                          ? `🔁 Reproducir recorte (${formatSeconds(selectedClip.start)} - ${formatSeconds(selectedClip.end)})`
                          : `🔁 Simular pase de foto (${selectedClip.duration}s)`}
                      </button>
                    </div>
                    <div className="time-display">
                      <span>{formatSeconds(currentTime)}</span> / <span>{formatSeconds(selectedClip.duration)}</span>
                    </div>
                  </div>
                </div>

                {/* Herramienta de Ajuste / Recorte */}
                {selectedClip.type === 'video' ? (
                  <div className="trim-tool-card">
                    <div className="trim-header">
                      <h4>✂️ Recortar este corte de vídeo ({selectedClip.name})</h4>
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
                ) : (
                  <div className="trim-tool-card">
                    <div className="trim-header">
                      <h4>📷 Duración en pantalla de la foto</h4>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Establece cuántos segundos se mostrará esta imagen en el montaje
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface-1)', padding: 12, borderRadius: 10 }}>
                      <label style={{ fontSize: '0.88rem', fontWeight: 600 }}>Segundos en pantalla:</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        step={0.5}
                        value={selectedClip.duration}
                        style={{
                          width: 80,
                          padding: '6px 10px',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '1rem',
                        }}
                        onChange={(e) => handleSetPhotoDuration(parseFloat(e.target.value) || 3)}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[2, 3, 4, 5, 8, 10].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            className="ctrl-btn"
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.8rem',
                              borderColor: selectedClip.duration === sec ? 'var(--accent)' : undefined,
                            }}
                            onClick={() => handleSetPhotoDuration(sec)}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel lateral: Información y propiedades */}
              <div className="side-editor-card">
                <div className="side-panel-header">
                  <h3>⚙️ Propiedades del elemento</h3>
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nombre:</label>
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

                  {selectedClip.type === 'video' && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.85rem' }}>Silenciar audio original:</label>
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
                    </>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      className="ctrl-btn primary"
                      style={{ justifyContent: 'center' }}
                      onClick={() => setActiveTab('texts')}
                    >
                      📝 Añadir textos explicativos ({selectedClip.texts.length})
                    </button>
                    <button
                      type="button"
                      className="ctrl-btn"
                      style={{ justifyContent: 'center' }}
                      onClick={() => duplicateClip(selectedClip)}
                    >
                      📋 Duplicar este elemento
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA 3: TEXTOS Y RÓTULOS */}
          {activeTab === 'texts' && (
            <div className="montajes-workspace-grid">
              <div className="video-player-card">
                <div className="video-container-relative">
                  {selectedClip.type === 'video' ? (
                    <video
                      ref={videoRef}
                      src={selectedClip.url}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onEnded={() => setIsPlaying(false)}
                      playsInline
                    />
                  ) : (
                    <img
                      src={selectedClip.url}
                      alt={selectedClip.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  )}

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
                      if (selectedClip.type === 'video' && videoRef.current) {
                        videoRef.current.currentTime = t;
                      }
                    }}
                  />
                  <div className="player-buttons-row">
                    <button type="button" className="ctrl-btn primary" onClick={togglePlay}>
                      {isPlaying ? '⏸️ Pausar' : '▶️ Reproducir'}
                    </button>
                    <div className="time-display">
                      Posición: <strong>{formatSeconds(Math.max(0, currentTime - selectedClip.start))}</strong> (total: {formatSeconds(selectedClip.end - selectedClip.start)})
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista y editor de textos */}
              <div className="side-editor-card">
                <div className="side-panel-header">
                  <h3>📝 Textos y rótulos en "${selectedClip.name}"</h3>
                  <button type="button" className="ctrl-btn primary" onClick={addTextOverlay}>
                    + Añadir texto
                  </button>
                </div>

                {selectedClip.texts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)' }}>
                    <p>Aún no hay textos en este elemento.</p>
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
                              placeholder="Escribe aquí el texto que se mostrará en el vídeo o foto..."
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

          {/* PESTAÑA 4: AUDIOS Y LOCUCIÓN */}
          {activeTab === 'audio' && (
            <div className="audio-manager-card">
              <div className="montajes-workspace-grid">
                {/* Grabador de voz en off */}
                <div className="recorder-box">
                  <span style={{ fontSize: 32 }}>🎙️</span>
                  <h3 style={{ margin: 0 }}>Grabar locución / voz en off</h3>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    Narra las indicaciones tácticas de viva voz mientras visualizas el montaje.
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
                            onClick={() => {
                              setAudioTracks((prev) => prev.filter((t) => t.id !== track.id));
                              markUnsaved();
                            }}
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
                                markUnsaved();
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
                                markUnsaved();
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

          {/* PESTAÑA 5: VISTA PREVIA MONTAJE GLOBAL */}
          {activeTab === 'preview' && (
            <div className="global-montage-container">
              <div className="side-panel-header">
                <h3>🎬 Previsualización completa de todo el montaje unido</h3>
                <span className="stat-value">{formatSeconds(totalMontageDuration)}</span>
              </div>

              <div className="video-container-relative">
                {clips[currentGlobalClipIndex]?.type === 'image' ? (
                  <img
                    src={clips[currentGlobalClipIndex]?.url}
                    alt={clips[currentGlobalClipIndex]?.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <video ref={globalVideoRef} playsInline />
                )}

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
                          if (c.type === 'video' && globalVideoRef.current) {
                            globalVideoRef.current.src = c.url;
                            globalVideoRef.current.currentTime = c.start;
                            globalVideoRef.current.volume = c.muted ? 0 : c.volume;
                          } else if (c.type === 'image') {
                            globalPhotoStartTimeRef.current = performance.now();
                          }
                        }}
                        title={`#${idx + 1} (${c.type === 'image' ? 'Foto' : 'Vídeo'}): ${c.name} (${formatSeconds(dur)})`}
                      >
                        #{idx + 1} {c.type === 'image' ? '📷 ' : '🎬 '} {c.name}
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
                      if (clips[0]?.type === 'video' && globalVideoRef.current) {
                        globalVideoRef.current.src = clips[0].url;
                        globalVideoRef.current.currentTime = clips[0].start;
                        if (isGlobalPlaying) globalVideoRef.current.play();
                      } else if (clips[0]?.type === 'image') {
                        globalPhotoStartTimeRef.current = performance.now();
                      }
                    }}
                  >
                    ⏮️ Reiniciar al principio
                  </button>
                </div>
                <div className="time-display">
                  Reproduciendo elemento {currentGlobalClipIndex + 1} de {clips.length} (
                  <span>{formatSeconds(globalCurrentTime)}</span> / <span>{formatSeconds(totalMontageDuration)}</span>)
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA 6: EXPORTAR Y DESCARGAR */}
          {activeTab === 'export' && (
            <div className="global-montage-container" style={{ alignItems: 'center', textAlign: 'center' }}>
              <div className="side-panel-header" style={{ width: '100%' }}>
                <h3>🚀 Exportar y descargar el vídeo completo en formato MP4</h3>
              </div>

              <div style={{ maxWidth: 640, padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ color: 'var(--text-muted)' }}>
                  Al pulsar el botón de exportación, el sistema unirá todos tus vídeos y fotos ({clips.length} elementos),
                  aplicará los recortes y tiempos de exposición, superpondrá los textos y fusionará todas las pistas de sonido en un único archivo de vídeo <strong>.MP4</strong> descargable de alta definición.
                </p>

                <div className="montajes-stat-badge" style={{ alignSelf: 'center', minWidth: 260 }}>
                  <span className="stat-label">Resumen del montaje final</span>
                  <span className="stat-value" style={{ fontSize: '1rem', marginTop: 4 }}>
                    {clips.length} elementos ({clips.filter((c) => c.type === 'video').length} vídeos, {clips.filter((c) => c.type === 'image').length} fotos) • {formatSeconds(totalMontageDuration)} duración total
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
                  🚀 Generar y Descargar Vídeo Unido (.MP4)
                </button>

                {exportedVideoUrl && (
                  <div className="export-success-box" style={{ marginTop: 20 }}>
                    <h4 style={{ margin: 0, color: 'var(--accent)' }}>✅ Archivo .MP4 generado correctamente</h4>
                    <p style={{ margin: 0, fontSize: '0.88rem' }}>
                      Si la descarga no ha comenzado automáticamente, haz clic en el siguiente enlace:
                    </p>
                    <a
                      href={exportedVideoUrl}
                      download={`${(projectName || 'montaje_tactico').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}_${Date.now()}.mp4`}
                      className="ctrl-btn primary"
                      style={{ alignSelf: 'center', padding: '8px 20px', textDecoration: 'none' }}
                    >
                      💾 Descargar archivo de vídeo (.mp4)
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
              <h3>Uniendo y procesando cortes y fotos...</h3>
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
