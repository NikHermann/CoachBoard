export const DIRECT_UPLOAD_LIMIT = 80 * 1024;
export const TARGET_COMPRESSED_BYTES = 70 * 1024;
export const MAX_FINAL_BYTES = 120 * 1024;
export const ABSOLUTE_FILE_LIMIT = 15 * 1024 * 1024;

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);

    reader.readAsDataURL(file);
  });
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function estimateDataUrlSize(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

export function renderImageToDataUrl(img, width, height, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

export async function compressImageToDataUrl(file, options = {}) {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    maxBytes = TARGET_COMPRESSED_BYTES,
    startQuality = 0.82,
    minQuality = 0.45
  } = options;

  const img = await loadImageFromFile(file);

  let width = img.width;
  let height = img.height;

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  let quality = startQuality;
  let dataUrl = renderImageToDataUrl(img, width, height, quality);

  while (estimateDataUrlSize(dataUrl) > maxBytes && quality > minQuality) {
    quality = Math.max(minQuality, quality - 0.08);
    dataUrl = renderImageToDataUrl(img, width, height, quality);
  }

  while (estimateDataUrlSize(dataUrl) > maxBytes && width > 300 && height > 300) {
    width = Math.round(width * 0.9);
    height = Math.round(height * 0.9);

    quality = startQuality;
    dataUrl = renderImageToDataUrl(img, width, height, quality);

    while (estimateDataUrlSize(dataUrl) > maxBytes && quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.08);
      dataUrl = renderImageToDataUrl(img, width, height, quality);
    }
  }

  return dataUrl;
}

export async function prepareExerciseImageDataUrl(file) {
  if (file.size > ABSOLUTE_FILE_LIMIT) {
    throw new Error(
      `Bild ist zu groß (${formatBytes(file.size)}). Bitte ein Bild unter ${formatBytes(ABSOLUTE_FILE_LIMIT)} wählen.`
    );
  }

  if (file.size <= DIRECT_UPLOAD_LIMIT) {
    const directDataUrl = await fileToDataUrl(file);

    if (estimateDataUrlSize(directDataUrl) > MAX_FINAL_BYTES) {
      throw new Error("Das Bild ist nach dem Einlesen noch zu groß. Bitte ein kleineres Bild wählen.");
    }

    return directDataUrl;
  }

  const shouldCompress = confirm(
    `Das Bild ist ${formatBytes(file.size)} groß.\n\nSoll es automatisch herunterkomprimiert werden?`
  );

  if (!shouldCompress) {
    throw new Error("Upload abgebrochen. Bild wurde nicht komprimiert.");
  }

  const compressedDataUrl = await compressImageToDataUrl(file, {
    maxWidth: 1200,
    maxHeight: 1200,
    maxBytes: TARGET_COMPRESSED_BYTES
  });

  const finalSize = estimateDataUrlSize(compressedDataUrl);

  if (finalSize > MAX_FINAL_BYTES) {
    throw new Error(
      `Das Bild ist selbst nach der Komprimierung noch zu groß (${formatBytes(finalSize)}). Bitte ein kleineres Bild wählen.`
    );
  }

  return compressedDataUrl;
}