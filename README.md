# map-kit

Svelte 5 components over MapLibre GL + OpenFreeMap vector tiles: a globe you pan and zoom,
pins from `[{id, lat, lon, props}]`, a side panel for the selected pin, named toggle layers,
fly-to, and an overlay slot that mounts a canvas or WebGPU surface registered to map
coordinates. Themed by CSS tokens. Domain-agnostic: the first consumer is
[surf-lab](https://github.com/dan-slater/surf-lab); client data maps (competitor pins with
prices, radius rings, heat layers) reuse the same components with different data.

Consumed by semver git tags (`#semver:^0.1.0`), never by branch.

Status: scaffold. See `HANDOVER.md` once it exists.
