// Pure filter/crop math for the post composer — no React in here.
// Each preset's `css` string is the ctx.filter equivalent of the matching
// .filter-* class in client/src/index.css (keep the two in sync).

export type FilterId =
  | 'normal'
  | 'clarendon'
  | 'gingham'
  | 'moon'
  | 'lark'
  | 'reyes'
  | 'juno'
  | 'slumber'
  | 'crema'
  | 'ludwig'
  | 'aden'
  | 'perpetua';

export interface FilterPreset {
  id: FilterId;
  name: string;
  /** Live-preview class from index.css. */
  className: string;
  /** ctx.filter string used when baking on canvas. */
  css: string;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'normal', name: 'Normal', className: 'filter-normal', css: '' },
  { id: 'clarendon', name: 'Clarendon', className: 'filter-clarendon', css: 'contrast(1.2) saturate(1.35)' },
  { id: 'gingham', name: 'Gingham', className: 'filter-gingham', css: 'brightness(1.05) hue-rotate(-10deg)' },
  { id: 'moon', name: 'Moon', className: 'filter-moon', css: 'grayscale(1) contrast(1.1) brightness(1.1)' },
  { id: 'lark', name: 'Lark', className: 'filter-lark', css: 'contrast(0.9) brightness(1.1) saturate(1.1)' },
  { id: 'reyes', name: 'Reyes', className: 'filter-reyes', css: 'sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)' },
  { id: 'juno', name: 'Juno', className: 'filter-juno', css: 'contrast(1.1) brightness(1.05) saturate(1.4) sepia(0.1)' },
  { id: 'slumber', name: 'Slumber', className: 'filter-slumber', css: 'saturate(0.66) brightness(1.05) sepia(0.2)' },
  { id: 'crema', name: 'Crema', className: 'filter-crema', css: 'sepia(0.5) contrast(0.95) brightness(1.05) saturate(0.9)' },
  { id: 'ludwig', name: 'Ludwig', className: 'filter-ludwig', css: 'contrast(1.05) brightness(1.05) saturate(0.8) sepia(0.08)' },
  { id: 'aden', name: 'Aden', className: 'filter-aden', css: 'hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)' },
  { id: 'perpetua', name: 'Perpetua', className: 'filter-perpetua', css: 'contrast(1.1) brightness(1.25) saturate(1.1)' },
];

export function findPreset(id: FilterId): FilterPreset {
  return FILTER_PRESETS.find((f) => f.id === id) ?? FILTER_PRESETS[0];
}

// ---- Adjustments (percent sliders, 100 = unchanged) ----

export const ADJUSTMENT_MIN = 50;
export const ADJUSTMENT_MAX = 150;
export const ADJUSTMENT_DEFAULT = 100;

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

// ---- Crop ----

export type AspectId = 'original' | '1:1' | '4:5' | '16:9';

export const ASPECT_PRESETS: { id: AspectId; label: string; ratio: number | null }[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];

export interface CropState {
  aspect: AspectId;
  /** Pan position of the crop window, 0..1 fraction of the overflow (0.5 = centered). */
  offsetX: number;
  offsetY: number;
}

export interface MediaEdit {
  filter: FilterId;
  adjustments: Adjustments;
  crop: CropState;
}

export function defaultEdit(): MediaEdit {
  return {
    filter: 'normal',
    adjustments: {
      brightness: ADJUSTMENT_DEFAULT,
      contrast: ADJUSTMENT_DEFAULT,
      saturation: ADJUSTMENT_DEFAULT,
    },
    crop: { aspect: 'original', offsetX: 0.5, offsetY: 0.5 },
  };
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Combined CSS/ctx filter string for a preset plus slider adjustments. */
export function filterToCss(preset: FilterId, adjustments: Adjustments): string {
  const parts: string[] = [];
  const base = findPreset(preset).css;
  if (base) parts.push(base);
  if (adjustments.brightness !== ADJUSTMENT_DEFAULT) parts.push(`brightness(${adjustments.brightness / 100})`);
  if (adjustments.contrast !== ADJUSTMENT_DEFAULT) parts.push(`contrast(${adjustments.contrast / 100})`);
  if (adjustments.saturation !== ADJUSTMENT_DEFAULT) parts.push(`saturate(${adjustments.saturation / 100})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The source-pixel rect the crop window covers: the largest rect with the
 * chosen aspect that fits the image, panned by offsetX/offsetY.
 */
export function getCropRect(srcWidth: number, srcHeight: number, crop: CropState): CropRect {
  const ratio = ASPECT_PRESETS.find((a) => a.id === crop.aspect)?.ratio ?? null;
  if (!ratio || srcWidth <= 0 || srcHeight <= 0) {
    return { x: 0, y: 0, width: srcWidth, height: srcHeight };
  }
  let width = srcWidth;
  let height = srcWidth / ratio;
  if (height > srcHeight) {
    height = srcHeight;
    width = srcHeight * ratio;
  }
  const x = (srcWidth - width) * clamp01(crop.offsetX);
  const y = (srcHeight - height) * clamp01(crop.offsetY);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** True when baking would be a pixel-identical pass-through. */
export function isNoopEdit(edit: MediaEdit): boolean {
  return (
    edit.filter === 'normal' &&
    edit.adjustments.brightness === ADJUSTMENT_DEFAULT &&
    edit.adjustments.contrast === ADJUSTMENT_DEFAULT &&
    edit.adjustments.saturation === ADJUSTMENT_DEFAULT &&
    edit.crop.aspect === 'original'
  );
}

/** Apply filter + adjustments + crop on a canvas and return a JPEG blob. */
export async function bakeImage(source: File | Blob, edit: MediaEdit): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const rect = getCropRect(bitmap.width, bitmap.height, edit.crop);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, rect.width);
    canvas.height = Math.max(1, rect.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser');
    ctx.filter = filterToCss(edit.filter, edit.adjustments);
    ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process image'))),
        'image/jpeg',
        0.92
      )
    );
  } finally {
    bitmap.close();
  }
}
