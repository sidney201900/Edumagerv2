/**
 * Utility service for image processing and compression
 */
export const compressImage = (file: File | string, maxWidth: number = 800, quality: number = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    const process = (src: string) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Try WebP first, fallback to JPEG
        const dataUrl = canvas.toDataURL('image/webp', quality);
        if (dataUrl.startsWith('data:image/webp')) {
          resolve(dataUrl);
        } else {
          resolve(canvas.toDataURL('image/jpeg', quality));
        }
      };
      img.onerror = reject;
      img.src = src;
    };

    if (file instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => process(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    } else {
      process(file);
    }
  });
};

/**
 * Gets the dimensions of an image from a base64 string or URL
 */
export const getImageDimensions = (src: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = src;
  });
};
