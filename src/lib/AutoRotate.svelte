<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import { useMap } from './context.js';

	/*
	 * Spins the globe slowly while nobody is touching it.
	 *
	 * Renders nothing. The rule that matters is that it must never fight the
	 * user: any interaction stops it at once, and it only starts again after
	 * the map has been still for `idleMs`. It also stands down whenever the
	 * document is hidden, so a background tab is not quietly burning frames.
	 */

	type Props = {
		/** Turn the rotation on. Default `true`: mount the component to opt in. */
		enabled?: boolean;
		/** Degrees of longitude per second. Negative spins the other way. Default 2. */
		degreesPerSecond?: number;
		/** How long the map must be still before rotation resumes. Default 4000 ms. */
		idleMs?: number;
		/** Stop rotating above this zoom, where a spin is disorienting. Default 4. */
		maxZoom?: number;
		/** Called when the rotation starts or stops, for a UI indicator. */
		onchange?: (spinning: boolean) => void;
	};

	let {
		enabled = true,
		degreesPerSecond = 2,
		idleMs = 4000,
		maxZoom = 4,
		onchange
	}: Props = $props();

	const mapContext = useMap();

	let map: MapLibreMap | null = null;
	let frame = 0;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let lastTime = 0;
	let spinning = false;
	let disposed = false;

	function setSpinning(next: boolean) {
		if (spinning === next) return;
		spinning = next;
		onchange?.(next);
	}

	function stop() {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		lastTime = 0;
		setSpinning(false);
	}

	function canSpin(): boolean {
		if (!enabled || disposed || !map) return false;
		if (typeof document !== 'undefined' && document.hidden) return false;
		return map.getZoom() <= maxZoom;
	}

	function tick(now: number) {
		frame = 0;
		if (!canSpin() || !map) {
			setSpinning(false);
			return;
		}

		// Skip the first frame: it has no previous timestamp to measure from,
		// and guessing one makes the globe jump when rotation resumes.
		if (lastTime !== 0) {
			const seconds = Math.min((now - lastTime) / 1000, 0.1);
			const centre = map.getCenter();
			map.setCenter([centre.lng + degreesPerSecond * seconds, centre.lat]);
		}
		lastTime = now;
		setSpinning(true);
		frame = requestAnimationFrame(tick);
	}

	function start() {
		if (frame || !canSpin()) return;
		lastTime = 0;
		frame = requestAnimationFrame(tick);
	}

	/** Any sign of a person: stop now, and queue a resume. */
	function interrupted() {
		stop();
		clearTimeout(idleTimer);
		if (!enabled || disposed) return;
		idleTimer = setTimeout(start, idleMs);
	}

	onMount(() => {
		let cancelled = false;
		let detach: (() => void) | undefined;

		void mapContext.ready().then((m) => {
			if (cancelled) return;
			map = m;

			// A move we caused has no originalEvent; one the user caused does.
			const onMoveStart = (event: { originalEvent?: unknown }) => {
				if (event?.originalEvent) interrupted();
			};
			const container = m.getContainer();
			const onPointer = () => interrupted();
			const onVisibility = () => (document.hidden ? stop() : interrupted());

			m.on('movestart', onMoveStart);
			m.on('zoomstart', onMoveStart);
			container.addEventListener('pointerdown', onPointer);
			container.addEventListener('wheel', onPointer, { passive: true });
			container.addEventListener('keydown', onPointer);
			document.addEventListener('visibilitychange', onVisibility);

			detach = () => {
				m.off('movestart', onMoveStart);
				m.off('zoomstart', onMoveStart);
				container.removeEventListener('pointerdown', onPointer);
				container.removeEventListener('wheel', onPointer);
				container.removeEventListener('keydown', onPointer);
				document.removeEventListener('visibilitychange', onVisibility);
			};

			if (enabled) idleTimer = setTimeout(start, idleMs);
		});

		return () => {
			cancelled = true;
			disposed = true;
			clearTimeout(idleTimer);
			stop();
			detach?.();
		};
	});

	$effect(() => {
		if (enabled) {
			if (!frame) {
				clearTimeout(idleTimer);
				idleTimer = setTimeout(start, idleMs);
			}
		} else {
			clearTimeout(idleTimer);
			stop();
		}
	});
</script>
