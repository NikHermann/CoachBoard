export const AVATAR_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const AVATAR_MAX_STORED_BYTES = 30 * 1024;
export const AVATAR_SIZE = 128;

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AVATAR_DATA_URL = /^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function hasSupportedSignature(bytes, type) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export function getAvatarDataBytes(dataUrl) {
  const match = AVATAR_DATA_URL.exec(String(dataUrl || ""));
  if (!match) return -1;
  const base64 = match[2];
  return Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

export function isValidAvatarData(dataUrl) {
  const bytes = getAvatarDataBytes(dataUrl);
  return bytes > 0 && bytes <= AVATAR_MAX_STORED_BYTES;
}

function canvasToDataUrl(canvas, type, quality) {
  return canvas.toDataURL(type, quality);
}

export async function prepareAvatarData(file) {
  if (!(file instanceof Blob)) throw new Error("Bitte eine Bilddatei auswählen.");
  if (!SUPPORTED_TYPES.has(file.type)) {
    throw new Error("Nur JPEG-, PNG- und WebP-Bilder werden unterstützt. SVG-Dateien sind nicht erlaubt.");
  }
  if (!file.size || file.size > AVATAR_MAX_SOURCE_BYTES) {
    throw new Error("Das ausgewählte Bild ist leer oder größer als 10 MB.");
  }

  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasSupportedSignature(signature, file.type)) {
    throw new Error("Der Dateiinhalt stimmt nicht mit einem unterstützten Bildformat überein.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Das Bild ist beschädigt oder konnte nicht sicher dekodiert werden.");
  }

  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 12000 || bitmap.height > 12000) {
      throw new Error("Die Bildabmessungen sind ungültig oder zu groß.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Die Bildverarbeitung wird von diesem Browser nicht unterstützt.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const sourceSize = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - sourceSize) / 2;
    const sourceY = (bitmap.height - sourceSize) / 2;
    context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    for (const type of ["image/webp", "image/jpeg"]) {
      for (let quality = 0.86; quality >= 0.3; quality -= 0.08) {
        const dataUrl = canvasToDataUrl(canvas, type, quality);
        if (dataUrl.startsWith(`data:${type};base64,`) && isValidAvatarData(dataUrl)) return dataUrl;
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error("Das Profilbild konnte nicht auf maximal 30 KB komprimiert werden.");
}
