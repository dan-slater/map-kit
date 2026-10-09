<script lang="ts" generics="P = Record<string, unknown>">
	import { onMount, type Snippet } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import './tokens.css';
	import { useMap } from './context.js';
	import { isLocationOccluded } from './mapUtils.js';
	import type { Pin, PinAnchor } from './types.js';

	/** What a custom pin snippet is told about the pin it is drawing. */
	type PinState = {
		selected: boolean;
		hovered: boolean;
		index: number;
	};

	type PinId = Pin<P>['id'];

	type Props = {
		/** The pins to draw. `props` is passed through untouched. */
		pins: Pin<P>[];
		/** Id of the selected pin, or `null`. Two-way. */
		selected?: PinId | null;
		/** The selected pin itself, kept in sync with `selected`. Read it, do not set it. */
		selectedPin?: Pin<P> | null;
		/** Id of the hovered pin, or `null`. Two-way. */
		hovered?: PinId | null;
		/** Which part of the pin sits on its coordinate. Default `'bottom'`. */
		anchor?: PinAnchor;
		/** Clicking the selected pin clears the selection. Default `true`. */
		toggle?: boolean;
		/** Fade pins that are behind the planet under globe projection. Default `true`. */
		hideOccluded?: boolean;
		/** Extra classes on the wrapper. */
		class?: string;
		/** Accessible label for a pin. Defaults to `props.name`, then the id. */
		label?: (pin: Pin<P>) => string;
		onselect?: (pin: Pin<P> | null) => void;
		onpinclick?: (pin: Pin<P>, event: MouseEvent) => void;
		onpinenter?: (pin: Pin<P>) => void;
		onpinleave?: (pin: Pin<P>) => void;
		/** Replace the default marker. Receives the pin and its current state. */
		pin?: Snippet<[Pin<P>, PinState]>;
	};

	let {
		pins,
		selected = $bindable(null),
		selectedPin = $bindable(null),
		hovered = $bindable(null),
		anchor = 'bottom',
		toggle = true,
		hideOccluded = true,
		class: className = '',
		label,
		onselect,
		onpinclick,
		onpinenter,
		onpinleave,
		pin: pinSnippet
	}: Props = $props();

	const mapContext = useMap();

	type Entry = { el: HTMLElement; pin: Pin<P> };
	let entries: Entry[] = [];
	let map: MapLibreMap | null = null;
	let scheduled = 0;
	let disposed = false;

	function labelFor(p: Pin<P>): string {
		if (label) return label(p);
		const name = (p.props as Record<string, unknown> | undefined)?.name;
		return typeof name === 'string' ? name : String(p.id);
	}

	function place(entry: Entry): void {
		if (!map) return;
		const point = map.project([entry.pin.lon, entry.pin.lat]);
		entry.el.style.transform = `translate(${point.x}px, ${point.y}px)`;
		if (hideOccluded) {
			const occluded = isLocationOccluded(map, entry.pin.lon, entry.pin.lat);
			entry.el.classList.toggle('mk-pin-anchor--occluded', occluded);
		} else {
			entry.el.classList.remove('mk-pin-anchor--occluded');
		}
	}

	function placeAll(): void {
		scheduled = 0;
		if (disposed) return;
		for (const entry of entries) place(entry);
	}

	function schedule(): void {
		if (scheduled || disposed) return;
		scheduled = requestAnimationFrame(placeAll);
	}

	/**
	 * Attaches a pin's element to the projection loop. An action rather than
	 * `bind:this` so the element and its pin stay paired through keyed list
	 * reorders.
	 */
	function register(el: HTMLElement, p: Pin<P>) {
		const entry: Entry = { el, pin: p };
		entries.push(entry);
		place(entry);
		return {
			update(next: Pin<P>) {
				entry.pin = next;
				place(entry);
			},
			destroy() {
				entries = entries.filter((e) => e !== entry);
			}
		};
	}

	function choose(p: Pin<P>, event: MouseEvent): void {
		onpinclick?.(p, event);
		const next = toggle && selected === p.id ? null : p.id;
		selected = next;
		onselect?.(next === null ? null : p);
	}

	onMount(() => {
		let cancelled = false;
		let detach: (() => void) | undefined;

		void mapContext.ready().then((m) => {
			if (cancelled) return;
			map = m;
			m.on('move', schedule);
			m.on('resize', schedule);
			detach = () => {
				m.off('move', schedule);
				m.off('resize', schedule);
			};
			placeAll();
		});

		return () => {
			cancelled = true;
			disposed = true;
			if (scheduled) cancelAnimationFrame(scheduled);
			detach?.();
		};
	});

	// Re-place when the pin set, the anchor or the occlusion rule changes.
	$effect(() => {
		void pins;
		void anchor;
		void hideOccluded;
		schedule();
	});

	$effect(() => {
		selectedPin = pins.find((p) => p.id === selected) ?? null;
	});
</script>

{#snippet defaultPin(p: Pin<P>, state: PinState)}
	<svg
		class="mk-pin__svg"
		viewBox="0 0 24 32"
		role="presentation"
		aria-hidden="true"
		focusable="false"
	>
		<path
			class="mk-pin__body"
			d="M12 1.2c-5.9 0-10.7 4.8-10.7 10.7 0 7.7 9.2 17.4 10 18.2a1 1 0 0 0 1.4 0c.8-.8 10-10.5 10-18.2C22.7 6 17.9 1.2 12 1.2Z"
		/>
		<circle class="mk-pin__dot" cx="12" cy="11.6" r="4" />
		{#if state.selected}
			<circle class="mk-pin__ring" cx="12" cy="11.6" r="8.6" />
		{/if}
	</svg>
{/snippet}

<div class="mk-pins {className}">
	{#each pins as p, index (p.id)}
		{@const state = { selected: selected === p.id, hovered: hovered === p.id, index }}
		<div class="mk-pin-anchor" use:register={p}>
			<div class="mk-pin-anchor__inner mk-pin-anchor__inner--{anchor}">
				<button
					type="button"
					class="mk-pin"
					class:mk-pin--selected={state.selected}
					class:mk-pin--hovered={state.hovered}
					aria-pressed={state.selected}
					aria-label={labelFor(p)}
					onclick={(event) => choose(p, event)}
					onpointerenter={() => {
						hovered = p.id;
						onpinenter?.(p);
					}}
					onpointerleave={() => {
						if (hovered === p.id) hovered = null;
						onpinleave?.(p);
					}}
					onfocus={() => {
						hovered = p.id;
					}}
					onblur={() => {
						if (hovered === p.id) hovered = null;
					}}
				>
					{#if pinSnippet}
						{@render pinSnippet(p, state)}
					{:else}
						{@render defaultPin(p, state)}
					{/if}
				</button>
			</div>
		</div>
	{/each}
</div>

<style>
	.mk-pins {
		position: absolute;
		inset: 0;
		z-index: var(--mk-z-pin);
		pointer-events: none;
	}

	.mk-pin-anchor {
		position: absolute;
		left: 0;
		top: 0;
		will-change: transform;
	}

	.mk-pin-anchor--occluded {
		opacity: var(--mk-pin-occluded-opacity);
		pointer-events: none;
	}

	.mk-pin-anchor__inner--bottom {
		transform: translate(-50%, -100%);
	}
	.mk-pin-anchor__inner--center {
		transform: translate(-50%, -50%);
	}
	.mk-pin-anchor__inner--top {
		transform: translate(-50%, 0);
	}
	.mk-pin-anchor__inner--left {
		transform: translate(0, -50%);
	}
	.mk-pin-anchor__inner--right {
		transform: translate(-100%, -50%);
	}

	.mk-pin {
		pointer-events: auto;
		display: block;
		padding: 0;
		margin: 0;
		border: 0;
		background: none;
		cursor: pointer;
		transform-origin: 50% 100%;
		transition: transform var(--mk-duration) var(--mk-easing);
		font-family: var(--mk-font-family);
		color: var(--mk-color-pin-label);
	}

	.mk-pin:focus-visible {
		outline: 2px solid var(--mk-color-focus);
		outline-offset: 2px;
		border-radius: var(--mk-radius-sm);
	}

	.mk-pin--hovered {
		transform: scale(var(--mk-pin-hover-scale));
	}

	.mk-pin--selected {
		transform: scale(var(--mk-pin-selected-scale));
	}

	.mk-pin__svg {
		display: block;
		width: var(--mk-pin-size);
		height: auto;
		overflow: visible;
		filter: drop-shadow(var(--mk-shadow-1));
	}

	.mk-pin__body {
		fill: var(--mk-color-pin);
		stroke: var(--mk-color-pin-stroke);
		stroke-width: var(--mk-pin-stroke-width);
		transition: fill var(--mk-duration) var(--mk-easing);
	}

	.mk-pin--hovered .mk-pin__body {
		fill: var(--mk-color-pin-hover);
	}

	.mk-pin--selected .mk-pin__body {
		fill: var(--mk-color-pin-selected);
	}

	.mk-pin__dot {
		fill: var(--mk-color-pin-stroke);
	}

	.mk-pin__ring {
		fill: none;
		stroke: var(--mk-color-pin-selected);
		stroke-width: 1.5;
		opacity: 0.55;
	}
</style>
