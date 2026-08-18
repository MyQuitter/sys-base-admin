import type { Area } from 'react-easy-crop';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}

function getRadianAngle(degree: number) {
  return (degree * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/**
 * 将 react-easy-crop 的裁剪区域导出为 PNG 文件。
 */
export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: Area,
  options?: {
    rotation?: number;
    outputSize?: number;
    fileName?: string;
    mimeType?: string;
  },
): Promise<File> {
  const rotation = options?.rotation ?? 0;
  const outputSize = options?.outputSize;
  const fileName = options?.fileName ?? 'cropped.png';
  const mimeType = options?.mimeType ?? 'image/png';

  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('无法创建裁剪画布');

  const targetWidth = outputSize ?? pixelCrop.width;
  const targetHeight = outputSize ?? pixelCrop.height;

  croppedCanvas.width = targetWidth;
  croppedCanvas.height = targetHeight;

  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    croppedCanvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('图片导出失败'));
    }, mimeType);
  });

  return new File([blob], fileName, { type: mimeType });
}
