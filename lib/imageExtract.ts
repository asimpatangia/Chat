/**
 * Client-side image reading and resizing.
 * Resizes large images to stay within AI vision model limits (~1568px).
 */

const MAX_DIM = 1568;

export async function readImageAsBase64(
  file: File
): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Downscale if either dimension exceeds the limit
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);

      // Preserve PNG transparency; use JPEG for everything else
      const mimeType: string = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = mimeType === 'image/jpeg' ? 0.85 : undefined;
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64 = dataUrl.split(',')[1];

      resolve({ base64, mimeType, width, height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for processing'));
    };

    img.src = objectUrl;
  });
}
