import { IMAGE_MAX_SIDE, IMAGE_QUALITY } from './config.js';

// 사진을 긴 변 IMAGE_MAX_SIDE 이하의 JPEG로 줄인다. 휴대폰 사진의 회전 정보를 반영한다.
export async function resizeImage(file) {
  const source = await decode(file);
  const { width, height } = source;
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 투명 PNG가 검게 변하지 않도록
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  if (source.close) source.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
      'image/jpeg',
      IMAGE_QUALITY,
    );
  });
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // 일부 브라우저는 옵션을 지원하지 않으므로 <img>로 다시 시도
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
