/* eslint-disable */
import GL from 'luma.gl/constants';
import {Texture2D, loadImages, loadTextures} from 'luma.gl';

const MAX_CANVAS_WIDTH = 1024;
const MAX_CANVAS_HEIGHT = 768;

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

// check if there are some icons from new data not fetched
export function needRepack(oldData, data, getIcon) {
  const oldIcons = getIcons(oldData, getIcon) || {};
  const icons = getIcons(data, getIcon) || {};
  return !Object.keys(icons).every(icon => oldIcons[icon]);
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
        if (rowHeight + yOffset > maxCanvasHeight) {
          // TODO
        }

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

export default class IconManager {
  constructor(
    gl,
    {
      data,
      iconAtlas,
      iconMapping,
      getIcon,
      onUpdate = noop,
      maxCanvasWidth = MAX_CANVAS_WIDTH,
      maxCanvasHeight = MAX_CANVAS_HEIGHT
    }
  ) {
    this.gl = gl;

    this.getIcon = getIcon;
    this.onUpdate = onUpdate;
    this.maxCanvasWidth = maxCanvasWidth;
    this.maxCanvasHeight = maxCanvasHeight;

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

  updateState({oldProps, props}) {
    if (props.iconAtlas) {
      this._updatePrePacked({oldProps, props});
    } else {
      this._updateAutoPacking({oldProps, props});
    }
  }

  _updatePrePacked({oldProps, props}) {
    const {iconAtlas, iconMapping} = props;
    if (iconMapping && oldProps.iconMapping !== iconMapping) {
      this._mapping = iconMapping;
      this.onUpdate({mappingChanged: true});
    }

    if (iconAtlas && oldProps.iconAtlas !== iconAtlas) {
      this._loadPrePackedTexture(iconAtlas);
    }
  }

  _updateAutoPacking({oldProps, props}) {
    if (needRepack(oldProps.data, props.data, this.getIcon)) {
      // if any icons are not fetched, re-layout the entire icon texture
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
        urls: [iconAtlas]
      }).then(([texture]) => {
        texture.setParameters({
          [GL.TEXTURE_MIN_FILTER]: DEFAULT_TEXTURE_MIN_FILTER,
          [GL.TEXTURE_MAG_FILTER]: DEFAULT_TEXTURE_MAG_FILTER
        });

        this._texture = texture;
        this.onUpdate({textureChanged: true});
      });
    }
  }

  _autoPackTexture(data) {
    const {maxCanvasWidth, maxCanvasHeight, getIcon} = this;
    if (data) {
      // generate icon mapping
      const {mapping, canvasHeight} = buildMapping({
        icons: Object.values(getIcons(data, getIcon)),
        maxCanvasWidth,
        maxCanvasHeight
      });

      this._mapping = mapping;

      // create new texture
      this._texture = new Texture2D(this.gl, {
        width: this.maxCanvasWidth,
        height: canvasHeight
      });

      this.onUpdate({mappingChanged: true, textureChanged: true});

      // load images
      this._loadImages(data);
    }
  }

  _loadImages(data) {
    for (let i = 0; i < data.length; i++) {
      const icon = this.getIcon(data[i]);
      if (icon.url) {
        loadImages({urls: [icon.url]}).then(([imageData]) => {
          const iconMapping = this._mapping[icon.url];
          const {x, y, width, height} = iconMapping;

          // update texture
          this._texture.setSubImageData({
            data: imageData,
            x,
            y,
            width,
            height,
            parameters: {
              [GL.TEXTURE_MIN_FILTER]: DEFAULT_TEXTURE_MIN_FILTER,
              [GL.TEXTURE_MAG_FILTER]: DEFAULT_TEXTURE_MAG_FILTER,
              [GL.UNPACK_FLIP_Y_WEBGL]: true
            }
          });
          // Call to regenerate mipmaps after modifying texture(s)
          this._texture.generateMipmap();

          this.onUpdate({textureChanged: true});
        });
      }
    }
  }
}
