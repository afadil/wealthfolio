/**
 * Client-side normalization of a user-picked image into the PNG the backend
 * accepts for custom asset logos (≤ 256 px square, ≤ 150 KB).
 *
 * Pure DOM (Image + canvas); no React, no adapters.
 */

export const LOGO_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";
export const LOGO_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const LOGO_MAX_OUTPUT_BYTES = 150 * 1024;
export const LOGO_SIZES = [256, 128] as const;

const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const SNIFF_BYTES = 1024;

export type LogoImageErrorCode =
  | "unsupported_type"
  | "too_large_input"
  | "decode_failed"
  | "encode_failed"
  | "too_large_output";

export class LogoImageError extends Error {
  constructor(
    readonly code: LogoImageErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "LogoImageError";
  }
}

export interface NormalizedLogoImage {
  blob: Blob;
  width: number;
  height: number;
  dataBase64: string;
  dataUri: string;
}

export interface ContainRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Fit a `srcWidth×srcHeight` image inside a `size×size` square, preserving
 * aspect ratio and centring it. Small sources are upscaled.
 */
export function computeContainRect(srcWidth: number, srcHeight: number, size: number): ContainRect {
  const scale = size / Math.max(srcWidth, srcHeight);
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));
  return { x: (size - width) / 2, y: (size - height) / 2, width, height };
}

/**
 * Detect a supported image type from the leading bytes. Drag-drop and some
 * Android pickers deliver files with an empty `type`.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, SNIFF_BYTES));
  if (/<svg[\s>]/i.test(text)) return "image/svg+xml";

  return null;
}

/** Chunked base64 encoding (avoids call-stack limits on large buffers). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function detectType(file: Blob): Promise<string | null> {
  if (SUPPORTED_TYPES.has(file.type)) return file.type;
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  return sniffImageType(head);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new LogoImageError("decode_failed"));
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function normalizeLogoImage(file: Blob): Promise<NormalizedLogoImage> {
  if (file.size > LOGO_MAX_INPUT_BYTES) {
    throw new LogoImageError("too_large_input");
  }

  const type = await detectType(file);
  if (!type) {
    throw new LogoImageError("unsupported_type");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);

    let srcWidth = image.naturalWidth;
    let srcHeight = image.naturalHeight;
    if (!srcWidth || !srcHeight) {
      // SVGs without intrinsic dimensions report 0×0; render them square.
      if (type !== "image/svg+xml") throw new LogoImageError("decode_failed");
      srcWidth = srcHeight = LOGO_SIZES[0];
    }

    for (const size of LOGO_SIZES) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new LogoImageError("encode_failed");

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, size, size);
      const rect = computeContainRect(srcWidth, srcHeight, size);
      try {
        context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      } catch {
        throw new LogoImageError("decode_failed");
      }

      const blob = await canvasToPngBlob(canvas);
      if (!blob) throw new LogoImageError("encode_failed");
      if (blob.size > LOGO_MAX_OUTPUT_BYTES) continue;

      const dataBase64 = await blobToBase64(blob);
      return {
        blob,
        width: size,
        height: size,
        dataBase64,
        dataUri: `data:image/png;base64,${dataBase64}`,
      };
    }

    throw new LogoImageError("too_large_output");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
