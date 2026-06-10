import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from '../../stores/uiStore';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

// On-screen viewport (CSS px) and exported avatar size.
const VIEW = 288;
const OUTPUT = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface AvatarCropModalProps {
  /** Image picked from the file input; null keeps the modal closed. */
  file: File | null;
  onClose: () => void;
  /** Receives the cropped square JPEG (OUTPUT×OUTPUT). */
  onCropped: (blob: Blob) => void;
}

interface Placement {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Circular avatar crop: drag to reposition, slider/buttons to zoom, exports a
 * 320px square blob drawn from the same placement as the live preview.
 */
export function AvatarCropModal({ file, onClose, onCropped }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  // Load the picked file into an <img>; reset placement per file.
  useEffect(() => {
    if (!file) {
      setImg(null);
      return;
    }
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSaving(false);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => {
      toast('Could not read that image', 'error');
      onClose();
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Cover-fit placement for the current zoom/offset, in viewport coordinates.
  const placement = useCallback(
    (z: number, off: { x: number; y: number }): Placement | null => {
      if (!img) return null;
      const scale = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) * z;
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      return { dx: (VIEW - dw) / 2 + off.x, dy: (VIEW - dh) / 2 + off.y, dw, dh };
    },
    [img]
  );

  // Keep the image covering the whole viewport.
  const clampOffset = useCallback(
    (off: { x: number; y: number }, z: number) => {
      const p = placement(z, { x: 0, y: 0 });
      if (!p) return off;
      const maxX = (p.dw - VIEW) / 2;
      const maxY = (p.dh - VIEW) / 2;
      return {
        x: Math.min(maxX, Math.max(-maxX, off.x)),
        y: Math.min(maxY, Math.max(-maxY, off.y)),
      };
    },
    [placement]
  );

  const changeZoom = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    setZoom(next);
    setOffset((off) => clampOffset(off, next));
  };

  // Live preview.
  useEffect(() => {
    const canvas = canvasRef.current;
    const p = placement(zoom, offset);
    if (!canvas || !img || !p) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = canvas.width / VIEW; // 2x backing store
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, p.dx * ratio, p.dy * ratio, p.dw * ratio, p.dh * ratio);
  }, [img, zoom, offset, placement]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    setOffset((off) => clampOffset({ x: off.x + dx, y: off.y + dy }, zoom));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  // Keyboard support: arrows nudge, +/- zoom.
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = 10;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setOffset((off) => clampOffset({ x: off.x + move[0], y: off.y + move[1] }, zoom));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      changeZoom(zoom + 0.1);
    } else if (e.key === '-') {
      e.preventDefault();
      changeZoom(zoom - 0.1);
    }
  };

  const save = () => {
    const p = placement(zoom, offset);
    if (!img || !p || saving) return;
    setSaving(true);
    const out = document.createElement('canvas');
    out.width = OUTPUT;
    out.height = OUTPUT;
    const ctx = out.getContext('2d');
    if (!ctx) {
      setSaving(false);
      toast('Could not crop the image', 'error');
      return;
    }
    const ratio = OUTPUT / VIEW;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.drawImage(img, p.dx * ratio, p.dy * ratio, p.dw * ratio, p.dh * ratio);
    out.toBlob(
      (blob) => {
        setSaving(false);
        if (!blob) {
          toast('Could not crop the image', 'error');
          return;
        }
        onCropped(blob);
        onClose();
      },
      'image/jpeg',
      0.9
    );
  };

  return (
    <Modal open={!!file} onClose={onClose} title="Crop photo" className="max-w-sm">
      <div className="flex flex-col items-center gap-4 p-4">
        <div
          className="relative overflow-hidden rounded-xl bg-neutral-950"
          style={{ width: VIEW, height: VIEW }}
        >
          <canvas
            ref={canvasRef}
            width={VIEW * 2}
            height={VIEW * 2}
            tabIndex={0}
            role="img"
            aria-label="Crop preview — drag or use arrow keys to reposition, plus and minus to zoom"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="h-full w-full cursor-move touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
          {/* Circle mask overlay (visual only — export stays square). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
          />
        </div>

        <div className="flex w-full items-center gap-3 px-2">
          <button
            type="button"
            onClick={() => changeZoom(zoom - 0.25)}
            aria-label="Zoom out"
            className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ZoomOut size={18} aria-hidden />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="flex-1 accent-primary"
          />
          <button
            type="button"
            onClick={() => changeZoom(zoom + 0.25)}
            aria-label="Zoom in"
            className="rounded-full p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ZoomIn size={18} aria-hidden />
          </button>
        </div>

        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!img || saving}>
            Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}
