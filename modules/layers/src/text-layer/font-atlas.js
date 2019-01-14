/* global document */
import {Texture2D} from 'luma.gl';
import TinySDF from '@mapbox/tiny-sdf';

const GL_TEXTURE_WRAP_S = 0x2802;
const GL_TEXTURE_WRAP_T = 0x2803;
const GL_CLAMP_TO_EDGE = 0x812f;
const MAX_CANVAS_WIDTH = 1024;
const DEFAULT_PADDING = 4;

const BASELINE_SCALE = 0.9;
const HEIGHT_SCALE = 1.2;

export const DEFAULT_CHAR_SET = [];
for (let i = 32; i < 128; i++) {
  DEFAULT_CHAR_SET.push(String.fromCharCode(i));
}

function makeRGBAImageData(ctx, alphaChannel, size) {
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;
  for (let i = 0; i < alphaChannel.length; i++) {
    data[4 * i + 3] = alphaChannel[i];
  }
  return imageData;
}

function setTextStyle(ctx, fontFamily, fontSize) {
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'baseline';
  ctx.textAlign = 'left';
}

export function makeFontAtlas(
  gl,
  {
    sdf,
    fontSize,
    buffer,
    radius,
    cutoff,
    fontFamily,
    fontWeight,
    characterSet = DEFAULT_CHAR_SET,
    padding = DEFAULT_PADDING
  }
) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // build mapping
  // measure texts
  let row = 0;
  let x = 0;
  // TODO - use Advanced text metrics when they are adopted:
  // https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics
  const fontHeight = fontSize * HEIGHT_SCALE;
  setTextStyle(ctx, fontFamily, fontSize);
  const mapping = {};

  Array.from(characterSet).forEach(char => {
    const {width} = ctx.measureText(char);

    if (x + width > MAX_CANVAS_WIDTH) {
      x = 0;
      row++;
    }
    mapping[char] = {
      x,
      y: row * (fontHeight + padding),
      width,
      height: fontHeight,
      mask: true
    };
    x += width + padding;
  });

  canvas.width = MAX_CANVAS_WIDTH;
  canvas.height = (row + 1) * (fontHeight + padding);

  setTextStyle(ctx, fontFamily, fontSize);

  // layout characters
  if (sdf) {
    const tinySDF = new TinySDF(fontSize, buffer, radius, cutoff, fontFamily, fontWeight);

    for (const char in mapping) {
      const image = makeRGBAImageData(ctx, tinySDF.draw(char), fontSize);
      ctx.putImageData(image, mapping[char].x, mapping[char].y);
    }
  } else {
    for (const char in mapping) {
      ctx.fillText(char, mapping[char].x, mapping[char].y + fontSize * BASELINE_SCALE);
    }
  }

  return {
    scale: HEIGHT_SCALE,
    mapping,
    texture: new Texture2D(gl, {
      pixels: canvas,
      // padding is added only between the characters but not for borders
      // enforce CLAMP_TO_EDGE to avoid any artifacts.
      parameters: {
        [GL_TEXTURE_WRAP_S]: GL_CLAMP_TO_EDGE,
        [GL_TEXTURE_WRAP_T]: GL_CLAMP_TO_EDGE
      }
    })
  };
}
