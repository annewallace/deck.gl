<!-- INJECT:"IconLayerDemo" -->

<p class="badges">
  <img src="https://img.shields.io/badge/64--bit-support-blue.svg?style=flat-square" alt="64-bit" />
</p>

# IconLayer

The Icon Layer renders raster icons at given coordinates.

## Pre-packed iconAtlas

```js
import DeckGL, {IconLayer} from 'deck.gl';

const ICON_MAPPING = {
  marker: {x: 0, y: 0, width: 32, height: 32, mask: true}
};

const App = ({data, viewport}) => {

  /**
   * Data format:
   * [
   *   {name: 'Colma (COLM)', address: '365 D Street, Colma CA 94014', exits: 4214, coordinates: [-122.466233, 37.684638]},
   *   ...
   * ]
   */
  const layer = new IconLayer({
    id: 'icon-layer',
    data,
    pickable: true,
    // iconAtlas and iconMapping are required
    // getIcon: return a string
    iconAtlas: 'images/icon-atlas.png',
    iconMapping: {
      marker: {
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        anchorY: 128,
        mask: true
      }
    },
    getIcon: d => 'marker',

    sizeScale: 15,
    getPosition: d => d.coordinates,
    getSize: d => 5,
    getColor: d => [Math.sqrt(d.exits), 140, 0],
    onHover: ({object, x, y}) => {
      const tooltip = `${object.name}\n${object.address}`;
      /* Update tooltip
         http://deck.gl/#/documentation/developer-guide/adding-interactivity?section=example-display-a-tooltip-for-hovered-object
      */
    }
  });

  return (<DeckGL {...viewport} layers={[layer]} />);
};
```

## Auto packing iconAtlas

```js
import DeckGL, {IconLayer} from 'deck.gl';

const ICON_MAPPING = {
  marker: {x: 0, y: 0, width: 32, height: 32, mask: true}
};

const App = ({data, viewport}) => {

  /**
   * Data format:
   * [
   *   {name: 'Colma (COLM)', avatar_url: 'https://images/colma_avatar.png', address: '365 D Street, Colma CA 94014', exits: 4214, coordinates: [-122.466233, 37.684638]},
   *   ...
   * ]
   */
  const layer = new IconLayer({
    id: 'icon-layer',
    data,
    pickable: true,
    // iconAtlas and iconMapping should not be provided
    // getIcon return an object which contains url to fetch icon
    getIcon: d => ({
      url: d.avatar_url,
      width: 128,
      height: 128,
      anchorY: 128,
      mask: true
    }),

    sizeScale: 15,
    getPosition: d => d.coordinates,
    getSize: d => 5,
    getColor: d => [Math.sqrt(d.exits), 140, 0],
    onHover: ({object, x, y}) => {
      const tooltip = `${object.name}\n${object.address}`;
      /* Update tooltip
         http://deck.gl/#/documentation/developer-guide/adding-interactivity?section=example-display-a-tooltip-for-hovered-object
      */
    }
  });

  return (<DeckGL {...viewport} layers={[layer]} />);
};
```

## Properties

Inherits from all [Base Layer](/docs/api-reference/layer.md) properties.

### Render Options

There are two approaches to load icons. You can pre-packed all icons into a sprite image (`iconAtlas`) and a JSON descriptor (`iconMapping`). 
You can also provide url for each icon, `IconLayer` will fetch the icons and automatically pack them into a `iconAtlas`.

#### Pre-packed vs Auto packing

- In some use cases, it is not possible to know the icons that will be used. Instead, each icon needs to be fetched from
 a programmatically generated URL at runtime. For example, if you want to visualize avatars of github contributors for a project on a map,
 It is not convenient for you to generate the `iconAtlas` with all the contributors' avatars. In this case, you can follow [auto packing](#auto-packing-iconatlas) approach.
- Auto packing icons is less efficient than pre-packed because the former needs go through all the icons to calculate `iconMapping` 
  and update texture data when each icon fetched.

#### Pre-packed iconAtlas

##### `iconAtlas` (Texture2D | String, required)

Atlas image url or texture

##### `iconMapping` (Object | String, required)

Icon names mapped to icon definitions. Each icon is defined with the following values:

- `x`: x position of icon on the atlas image
- `y`: y position of icon on the atlas image
- `width`: width of icon on the atlas image
- `height`: height of icon on the atlas image
- `anchorX`: horizontal position of icon anchor. Default: half width.
- `anchorY`: vertical position of icon anchor. Default: half height.
- `mask`: whether icon is treated as a transparency mask.
  If `true`, user defined color is applied.
  If `false`, pixel color from the image is applied. User still can specify the opacity through getColor.
  Default: `false`
  
##### `getIcon` (Function, optional)

- Default: `d => d.icon`

Method called to retrieve the icon name of each object, returns string.

#### Auto packing iconAtlas

`iconAtlas` and `iconMapping` should not be provided in this case, otherwise it may cause error since `IconLayer` will attempt to retrieve icons from given pre-packed `iconAtlas`

##### `getIcon` (Function, optional)

- Default: `d => d.icon`

Return an object which contains the following properties. 

- `url`: url to fetch the icon
- `height`: height of icon
- `width`: width of icon
- `anchorX`, `anchorY`, `mask` are the same as mentioned in `iconMapping`

#### Options in both pre-packed and auto packing cases

##### `sizeScale` (Number, optional)

- Default: `1`

Icon size multiplier.

##### `fp64` (Boolean, optional)

- Default: `false`

Whether the layer should be rendered in high-precision 64-bit mode. Note that since deck.gl v6.1, the default 32-bit projection uses a hybrid mode that matches 64-bit precision with significantly better performance.

### Data Accessors

##### `getPosition` (Function, optional) ![transition-enabled](https://img.shields.io/badge/transition-enabled-green.svg?style=flat-square")

- Default: `d => d.position`

Method called to retrieve the position of each object, returns `[lng, lat, z]`.


##### `getSize` (Function|Number, optional) ![transition-enabled](https://img.shields.io/badge/transition-enabled-green.svg?style=flat-square")

- Default: `1`

The height of each object, in pixels.

- If a number is provided, it is used as the size for all objects.
- If a function is provided, it is called on each object to retrieve its size.


##### `getColor` (Function|Array, optional) ![transition-enabled](https://img.shields.io/badge/transition-enabled-green.svg?style=flat-square")

- Default: `[0, 0, 0, 255]`

The rgba color of each object, in `r, g, b, [a]`. Each component is in the 0-255 range.

- If an array is provided, it is used as the color for all objects.
- If a function is provided, it is called on each object to retrieve its color.
- If `mask` = false, only the alpha component will be used to control the opacity of the icon.

##### `getAngle` (Function|Number, optional) ![transition-enabled](https://img.shields.io/badge/transition-enabled-green.svg?style=flat-square")

- Default: `0`

The rotating angle  of each object, in degrees.

- If a number is provided, it is used as the angle for all objects.
- If a function is provided, it is called on each object to retrieve its angle.


## Source

[modules/layers/src/icon-layer](https://github.com/uber/deck.gl/tree/master/modules/layers/src/icon-layer)

