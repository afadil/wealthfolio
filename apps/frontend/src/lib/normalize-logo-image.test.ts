import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  computeContainRect,
  LOGO_MAX_INPUT_BYTES,
  LOGO_MAX_OUTPUT_BYTES,
  LogoImageError,
  normalizeLogoImage,
  sniffImageType,
} from "./normalize-logo-image";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function blobWithSize(size: number, type = "image/png"): Blob {
  const blob = new Blob(["x"], { type });
  Object.defineProperty(blob, "size", { value: size });
  return blob;
}

/** Controls what the stubbed `Image` reports and whether it loads. */
const imageStub = { width: 100, height: 100, fail: false };
/** Byte size returned by `toBlob` for a given canvas size. */
const blobSizeBySize = new Map<number, number>();

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => {
      if (imageStub.fail) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = imageStub.width;
      this.naturalHeight = imageStub.height;
      this.onload?.();
    });
  }
}

const drawImage = vi.fn();
const createObjectURL = vi.fn(() => "blob:logo");
const revokeObjectURL = vi.fn();

async function expectCode(promise: Promise<unknown>, code: LogoImageError["code"]) {
  await expect(promise).rejects.toMatchObject({ code });
  await expect(promise).rejects.toBeInstanceOf(LogoImageError);
}

describe("normalize-logo-image", () => {
  beforeEach(() => {
    imageStub.width = 100;
    imageStub.height = 100;
    imageStub.fail = false;
    blobSizeBySize.clear();
    drawImage.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();

    vi.stubGlobal("Image", FakeImage);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          drawImage,
          clearRect: vi.fn(),
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
        }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
    ) {
      const size = blobSizeBySize.get(this.width) ?? 1024;
      callback(size < 0 ? null : blobWithSize(size));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  describe("computeContainRect", () => {
    it("letterboxes wide sources", () => {
      expect(computeContainRect(500, 100, 256)).toEqual({ x: 0, y: 102.5, width: 256, height: 51 });
    });

    it("pillarboxes tall sources", () => {
      expect(computeContainRect(100, 400, 256)).toEqual({ x: 96, y: 0, width: 64, height: 256 });
    });

    it("fills square sources", () => {
      expect(computeContainRect(1000, 1000, 128)).toEqual({ x: 0, y: 0, width: 128, height: 128 });
    });

    it("upscales small sources", () => {
      expect(computeContainRect(16, 16, 256)).toEqual({ x: 0, y: 0, width: 256, height: 256 });
    });
  });

  describe("sniffImageType", () => {
    it("recognises PNG, JPEG, WebP and SVG signatures", () => {
      expect(sniffImageType(bytesOf(PNG_1X1_BASE64))).toBe("image/png");
      expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
      const webp = new Uint8Array(12);
      webp.set([0x52, 0x49, 0x46, 0x46], 0);
      webp.set([0x57, 0x45, 0x42, 0x50], 8);
      expect(sniffImageType(webp)).toBe("image/webp");
      expect(
        sniffImageType(
          new TextEncoder().encode(
            '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg">',
          ),
        ),
      ).toBe("image/svg+xml");
    });

    it("returns null for text", () => {
      expect(sniffImageType(new TextEncoder().encode("hello world"))).toBeNull();
    });
  });

  describe("normalizeLogoImage", () => {
    it("sniffs the type when the file has none and returns a 256px PNG", async () => {
      const file = new Blob([bytesOf(PNG_1X1_BASE64)], { type: "" });

      const result = await normalizeLogoImage(file);

      expect(result.width).toBe(256);
      expect(result.height).toBe(256);
      expect(result.dataUri).toBe(`data:image/png;base64,${result.dataBase64}`);
      expect(atob(result.dataBase64)).toBe("x");
      expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 256, 256);
      expect(createObjectURL).toHaveBeenCalledWith(file);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:logo");
    });

    it("rejects unsupported content", async () => {
      await expectCode(
        normalizeLogoImage(new Blob(["just text"], { type: "text/plain" })),
        "unsupported_type",
      );
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("rejects inputs above the size guard before decoding", async () => {
      await expectCode(
        normalizeLogoImage(blobWithSize(LOGO_MAX_INPUT_BYTES + 1)),
        "too_large_input",
      );
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("maps a decode failure (e.g. .txt renamed .png) and revokes the URL", async () => {
      imageStub.fail = true;

      await expectCode(
        normalizeLogoImage(new Blob(["not really png"], { type: "image/png" })),
        "decode_failed",
      );
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:logo");
    });

    it("renders SVGs without intrinsic size as a square", async () => {
      imageStub.width = 0;
      imageStub.height = 0;

      const result = await normalizeLogoImage(new Blob(["<svg/>"], { type: "image/svg+xml" }));

      expect(result.width).toBe(256);
      expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 256, 256);
    });

    it("letterboxes wide sources", async () => {
      imageStub.width = 5000;
      imageStub.height = 500;

      await normalizeLogoImage(new Blob(["x"], { type: "image/jpeg" }));

      expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 115, 256, 26);
    });

    it("falls back to 128px when the 256px PNG exceeds the cap", async () => {
      blobSizeBySize.set(256, LOGO_MAX_OUTPUT_BYTES + 1);
      blobSizeBySize.set(128, 4096);

      const result = await normalizeLogoImage(new Blob(["x"], { type: "image/png" }));

      expect(result.width).toBe(128);
      expect(result.blob.size).toBe(4096);
    });

    it("fails with too_large_output when every size exceeds the cap", async () => {
      blobSizeBySize.set(256, LOGO_MAX_OUTPUT_BYTES + 1);
      blobSizeBySize.set(128, LOGO_MAX_OUTPUT_BYTES + 1);

      await expectCode(
        normalizeLogoImage(new Blob(["x"], { type: "image/png" })),
        "too_large_output",
      );
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it("fails with encode_failed when the canvas cannot produce a PNG", async () => {
      blobSizeBySize.set(256, -1);

      await expectCode(normalizeLogoImage(new Blob(["x"], { type: "image/png" })), "encode_failed");
    });
  });
});
