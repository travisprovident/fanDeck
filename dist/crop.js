export function validSelection(rect) {
  return Boolean(rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001);
}

// Browser tab capture can letterbox the source viewport inside a fixed-size
// frame. Convert page-relative coordinates into that frame before isolating it.
export function playerRectInCapture(area, captureWidth, captureHeight) {
  if (!validSelection(area?.rect) || ![area.viewport?.width, area.viewport?.height, captureWidth, captureHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = Math.min(captureWidth / area.viewport.width, captureHeight / area.viewport.height);
  const width = area.viewport.width * scale;
  const height = area.viewport.height * scale;
  return {
    x: ((captureWidth - width) / 2 + area.rect.x * width) / captureWidth,
    y: ((captureHeight - height) / 2 + area.rect.y * height) / captureHeight,
    width: area.rect.width * width / captureWidth,
    height: area.rect.height * height / captureHeight,
  };
}

export function cropGeometry(rect, sourceWidth, sourceHeight, tileWidth, tileHeight, fill = false, anchorX = 0.5, anchorY = 0.5) {
  if (!validSelection(rect) || ![sourceWidth, sourceHeight, tileWidth, tileHeight].every(value => Number.isFinite(value) && value > 0) || ![anchorX, anchorY].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return null;
  const croppedWidth = rect.width * sourceWidth;
  const croppedHeight = rect.height * sourceHeight;
  const scale = (fill ? Math.max : Math.min)(tileWidth / croppedWidth, tileHeight / croppedHeight);
  return {
    box: { x: (tileWidth - croppedWidth * scale) * anchorX, y: (tileHeight - croppedHeight * scale) * anchorY, width: croppedWidth * scale, height: croppedHeight * scale },
    video: { x: -rect.x * sourceWidth * scale, y: -rect.y * sourceHeight * scale, width: sourceWidth * scale, height: sourceHeight * scale },
  };
}
