# Theming

This page is about the components: the pins, the panel, the overlay. For the
map underneath them, see **Theming the basemap** in the README, which covers
`<Map theme>`, the four presets and `themeStyle`. The two fit together:
`tokensFor(theme)` turns a basemap theme into the `--mk-` overrides described
here, so the components match the map.


Every colour, radius, size and font the map-kit components use reads from a CSS
custom property with an `--mk-` prefix. Override the ones you care about and
leave the rest.

The defaults live in `src/lib/tokens.css`, which every component imports. They
are declared through `:where(:root)`, which has **zero specificity**, so a plain
`:root { ... }` block of your own wins no matter where it sits in the cascade
and no matter the import order.

```css
/* app.css */
:root {
	--mk-color-accent: #0f766e;
	--mk-color-pin: #0f766e;
	--mk-color-pin-selected: #f59e0b;
	--mk-radius-lg: 4px;
	--mk-font-family: 'Inter', system-ui, sans-serif;
}
```

Tokens are inherited, so you can scope a theme to part of the page rather than
the whole document. Two differently branded maps side by side:

```css
.client-a { --mk-color-pin: #0f766e; }
.client-b { --mk-color-pin: #be123c; }
```

```svelte
<div class="client-a"><Map>...</Map></div>
<div class="client-b"><Map>...</Map></div>
```

## The tokens

### Typography

| Token | Default | Used by |
| --- | --- | --- |
| `--mk-font-family` | system UI stack | every component |
| `--mk-font-family-mono` | system mono stack | monospace text in your own panel content |
| `--mk-font-size-sm` | `0.8125rem` | secondary panel text |
| `--mk-font-size-md` | `0.9375rem` | body text |
| `--mk-font-size-lg` | `1.125rem` | panel title |
| `--mk-font-weight-normal` | `400` | body |
| `--mk-font-weight-medium` | `550` | panel title |
| `--mk-font-weight-bold` | `700` | available for your content |
| `--mk-line-height` | `1.45` | body |

### Palette

| Token | Default | Used by |
| --- | --- | --- |
| `--mk-color-surface` | `#ffffff` | panel background, close button hover |
| `--mk-color-surface-muted` | `#f4f5f7` | close button background |
| `--mk-color-text` | `#14161a` | body text |
| `--mk-color-text-muted` | `#5c6370` | secondary text, close icon |
| `--mk-color-border` | `#d8dbe0` | panel border, dividers, sheet handle |
| `--mk-color-accent` | `#1f6feb` | `<Layer>` default paint, your call-to-action styling |
| `--mk-color-accent-contrast` | `#ffffff` | text on accent |
| `--mk-color-scrim` | `rgb(10 12 16 / 0.35)` | available for your own backdrops |
| `--mk-color-focus` | `#1f6feb` | focus outlines |

### Pins

| Token | Default | Used by |
| --- | --- | --- |
| `--mk-color-pin` | `#1f6feb` | default marker fill |
| `--mk-color-pin-stroke` | `#ffffff` | marker outline and inner dot |
| `--mk-color-pin-hover` | `#2f81f7` | marker fill when hovered or focused |
| `--mk-color-pin-selected` | `#e3663e` | marker fill and ring when selected |
| `--mk-color-pin-label` | `#14161a` | text colour inherited by a custom pin snippet |
| `--mk-pin-size` | `28px` | marker width; height follows the aspect ratio |
| `--mk-pin-stroke-width` | `2px` | marker outline |
| `--mk-pin-hover-scale` | `1.12` | hover transform |
| `--mk-pin-selected-scale` | `1.2` | selected transform |
| `--mk-pin-occluded-opacity` | `0` | opacity for pins behind the globe |

### Shape, spacing and elevation

| Token | Default |
| --- | --- |
| `--mk-radius-sm` | `4px` |
| `--mk-radius-md` | `8px` |
| `--mk-radius-lg` | `14px` |
| `--mk-radius-pill` | `999px` |
| `--mk-space-1` … `--mk-space-5` | `4px`, `8px`, `12px`, `18px`, `28px` |
| `--mk-shadow-1` | `0 1px 2px rgb(10 12 16 / 0.12)` |
| `--mk-shadow-2` | `0 10px 30px rgb(10 12 16 / 0.18)` |

### Panel

| Token | Default | Used by |
| --- | --- | --- |
| `--mk-panel-width` | `340px` | panel width on wide viewports |
| `--mk-panel-background` | falls back to `--mk-color-surface` | panel background |
| `--mk-panel-inset` | falls back to `--mk-space-3` | gap between panel and map edge |
| `--mk-sheet-max-height` | `60vh` | bottom sheet height below 640px |

### Motion and stacking

| Token | Default | Notes |
| --- | --- | --- |
| `--mk-duration` | `180ms` | set to `0ms` to switch animation off |
| `--mk-easing` | `cubic-bezier(0.2, 0, 0.1, 1)` | |
| `--mk-map-background` | `transparent` | behind the map canvas. Under globe projection the canvas is transparent outside the planet, so set this or the host page shows through. A basemap theme sets it to its sky colour. |
| `--mk-z-overlay` | `1` | `<Overlay>` canvas |
| `--mk-z-pin` | `2` | `<Pins>` layer |
| `--mk-z-panel` | `3` | `<Panel>` |

`--mk-duration` drops to `0ms` on its own under
`@media (prefers-reduced-motion: reduce)`.

## A dark theme

```css
:root {
	--mk-color-surface: #161b22;
	--mk-color-surface-muted: #21262d;
	--mk-color-text: #e6edf3;
	--mk-color-text-muted: #8b949e;
	--mk-color-border: #30363d;
	--mk-shadow-2: 0 10px 30px rgb(0 0 0 / 0.5);
}
```

Pair it with the `positron` or a custom dark MapLibre style:
`<Map style="positron" />`.

## What tokens cannot reach

Two things sit outside CSS and need another route.

**MapLibre paint properties.** Colours inside a `<Layer>` spec are parsed by
MapLibre's own colour parser, which does not understand `var(...)`. Resolve the
token in JavaScript instead:

```svelte
<script lang="ts">
  import { Layer, cssToken } from '@dan-slater/map-kit';

  let accent = $state('#1f6feb');
</script>

<Layer
  id="ring"
  {data}
  onadd={(ids, map) => (accent = cssToken(map.getContainer(), '--mk-color-accent', accent))}
  layer={{ type: 'line', paint: { 'line-color': accent } }}
/>
```

A `<Layer>` given no `paint` of its own already does this: it reads
`--mk-color-accent` off the map container and uses it.

**The mobile breakpoint.** `<Panel>` becomes a bottom sheet below 640px. Media
queries cannot read custom properties, so that number is a literal in the
component's stylesheet. If 640px is wrong for your layout, override the rule:

```css
@media (max-width: 900px) {
	.mk-panel {
		top: auto;
		left: var(--mk-panel-inset);
		right: var(--mk-panel-inset);
		width: auto;
		max-height: var(--mk-sheet-max-height);
	}
}
```

## Class names

Every element carries a stable `mk-` class, so you can reach past the tokens
when you have to: `.mk-map`, `.mk-pins`, `.mk-pin-anchor`, `.mk-pin`,
`.mk-pin__svg`, `.mk-panel`, `.mk-panel__header`, `.mk-panel__title`,
`.mk-panel__body`, `.mk-panel__footer`, `.mk-overlay`. Component styles are
scoped by Svelte, so your own rules on these classes win without `:global`
gymnastics on your side.
