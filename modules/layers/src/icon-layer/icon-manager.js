/* eslint-disable */
import GL from '@luma.gl/constants';
import {Texture2D, loadImages, loadTextures} from 'luma.gl';

const MAX_CANVAS_WIDTH = 1024;

const DEFAULT_TEXTURE_MIN_FILTER = GL.LINEAR_MIPMAP_LINEAR;
// GL.LINEAR is the default value but explicitly set it here
const DEFAULT_TEXTURE_MAG_FILTER = GL.LINEAR;

const noop = () => {};

function nextPowOfTwo(number) {
  return Math.pow(2, Math.ceil(Math.log2(number)));
}

// traverse icons in a row of icon atlas
// extend each icon with left-top coordinates
function buildRowMapping(mapping, columns, yOffset) {
  for (let i = 0; i < columns.length; i++) {
    const {icon, xOffset} = columns[i];
    mapping[icon.url] = Object.assign({}, icon, {
      x: xOffset,
      y: yOffset
    });
  }
}

/**
 * Generate coordinate mapping to retrieve icon left-top position from an icon atlas
 * @param icons {Array<Object>} list of icons, each icon requires url, width, height
 * @param maxCanvasWidth {Number}
 * @param maxCanvasHeight {Number}
 * @returns {{mapping: {'/icon/1': {url, width, height, ...}},, canvasHeight: {Number}}}
 */
export function buildMapping({icons, maxCanvasWidth, maxCanvasHeight}) {
  // x position till current column
  let xOffset = 0;
  // y position till current row
  let yOffset = 0;
  // height of current row
  let rowHeight = 0;

  let columns = [];
  const mapping = {};

  // Strategy to layout all the icons into a texture:
  // traverse the icons sequentially, layout the icons from left to right, top to bottom
  // when the sum of the icons width is equal or larger than maxCanvasWidth,
  // move to next row from total height so far plus max height of the icons in previous row
  // row width is equal to maxCanvasWidth
  // row height is decided by the max height of the icons in that row
  // mapping coordinates of each icon is its left-top position in the texture
  for (let i = 0; i < icons.length; i++) {
    const icon = icons[i];
    if (!mapping[icon.url]) {
      const {height, width} = icon;

      // fill one row
      if (xOffset + width > maxCanvasWidth) {
        buildRowMapping(mapping, columns, yOffset);

        xOffset = 0;
        yOffset = rowHeight + yOffset;
        rowHeight = 0;
        columns = [];
      }

      columns.push({
        icon,
        xOffset
      });

      xOffset = xOffset + width;
      rowHeight = Math.max(rowHeight, height);
    }
  }

  if (columns.length > 0) {
    buildRowMapping(mapping, columns, yOffset);
  }

  const canvasHeight = nextPowOfTwo(rowHeight + yOffset);
  return {
    mapping,
    canvasHeight
  };
}

function getIcons(data, getIcon) {
  if (!data) {
    return null;
  }

  return data.reduce((resMap, point) => {
    const icon = getIcon(point);
    if (!resMap[icon.url]) {
      resMap[icon.url] = icon;
    }
    return resMap;
  }, {});
}

export default class IconManager {
  constructor(
    gl,
    {data, iconAtlas, iconMapping, getIcon, onUpdate = noop, maxCanvasWidth = MAX_CANVAS_WIDTH}
  ) {
    this.gl = gl;

    this.getIcon = getIcon;
    this.onUpdate = onUpdate;
    this.maxCanvasWidth = maxCanvasWidth;

    if (iconAtlas) {
      this._mapping = iconMapping;
      this._loadPrePackedTexture(iconAtlas, iconMapping);
    } else {
      this._autoPackTexture(data);
    }
  }

  getTexture() {
    return this._texture;
  }

  getIconMapping(dataPoint) {
    const icon = this.getIcon(dataPoint);
    const name = icon ? (typeof icon === 'object' ? icon.url : icon) : null;
    return this._mapping[name];
  }

  updateState({oldProps, props, changeFlags}) {
    if (props.iconAtlas) {
      this._updatePrePacked({oldProps, props, changeFlags});
    } else {
      this._updateAutoPacking({oldProps, props, changeFlags});
    }
  }

  _updatePrePacked({oldProps, props}) {
    const {iconAtlas, iconMapping} = props;

    this._mapping = iconMapping;
    if (oldProps.iconMapping !== iconMapping) {
      this.onUpdate({mappingChanged: true});
    }

    if (iconAtlas && oldProps.iconAtlas !== iconAtlas) {
      this._loadPrePackedTexture(iconAtlas);
    }
  }

  _updateAutoPacking({oldProps, props, changeFlags}) {
    if (
      changeFlags.dataChanged ||
      changeFlags.updateTriggersChanged.all ||
      changeFlags.updateTriggersChanged.getIcon
    ) {
      this._autoPackTexture(props.data);
    }
  }

  _loadPrePackedTexture(iconAtlas) {
    if (iconAtlas instanceof Texture2D) {
      iconAtlas.setParameters({
        [GL.TEXTURE_MIN_FILTER]: DEFAULT_TEXTURE_MIN_FILTER,
        [GL.TEXTURE_MAG_FILTER]: DEFAULT_TEXTURE_MAG_FILTER
      });

      this._texture = iconAtlas;
      this.onUpdate({textureChanged: true});
    } else if (typeof iconAtlas === 'string') {
      loadTextures(this.gl, {
        urls: [iconAtlas],
        parameters: {
          [GL.TEXTURE_MIN_FILTER]: DEFAULT_TEXTURE_MIN_FILTER,
          [GL.TEXTURE_MAG_FILTER]: DEFAULT_TEXTURE_MAG_FILTER,
          // `unpackFlipY` is true by default
          unpackFlipY: false
        }
      }).then(([texture]) => {
        this._texture = texture;
        this.onUpdate({textureChanged: true});
      });
    }
  }

  _autoPackTexture(data) {
    if (data && data.length) {
      const {maxCanvasWidth, getIcon} = this;
      const icons = Object.values(getIcons(data, getIcon));
      // generate icon mapping
      const {mapping, canvasHeight} = buildMapping({
        icons,
        maxCanvasWidth
      });

      this._mapping = mapping;

      // create new texture
      this._texture = new Texture2D(this.gl, {
        width: this.maxCanvasWidth,
        height: canvasHeight
      });

      this.onUpdate({mappingChanged: true, textureChanged: true});

      // load images
      this._loadImages(icons);
    }
  }

  _loadImages(icons) {
    for (const icon of icons) {
      if (icon.url) {
        loadImages({urls: [icon.url]}).then(([imageData]) => {
          const {naturalWidth, naturalHeight} = imageData;
          const iconMapping = this._mapping[icon.url];
          Object.assign(iconMapping, {naturalWidth, naturalHeight});
          const {x, y} = iconMapping;

          // update texture with image actual dimention
          this._texture.setSubImageData({
            data: imageData,
            x,
            y,
            width: naturalWidth,
            height: naturalHeight,
            parameters: {
              [GL.TEXTURE_MIN_FILTER]: DEFAULT_TEXTURE_MIN_FILTER,
              [GL.TEXTURE_MAG_FILTER]: DEFAULT_TEXTURE_MAG_FILTER
            }
          });

          // Call to regenerate mipmaps after modifying texture(s)
          this._texture.generateMipmap();
          this.onUpdate({mappingChanged: true, textureChanged: true});
        });
      }
    }
  }
}
