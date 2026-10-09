<script lang="ts">
	import type { Snippet } from 'svelte';
	import './tokens.css';
	import type { BasemapTheme } from './theme.js';
	import { themeNameOf, themes as builtInThemes, type ThemeName } from './themes.js';

	/*
	 * The stock settings panel: a theme picker and a globe/map toggle.
	 *
	 * Entirely optional. map-kit's position is that an app's controls should
	 * look like that app, so the real interface is `mapSettings()` plus the
	 * bindable props on `<Map>`. This is here so a demo, an internal tool or a
	 * first draft does not have to write one.
	 *
	 * It carries structure rather than decoration: everything visible comes
	 * from `--mk-` tokens, so it follows whatever theme is selected.
	 */

	type Props = {
		/** Two-way. Bind to `settings.theme` or straight to `<Map bind:theme>`. */
		theme?: BasemapTheme | null;
		/** Two-way. */
		projection?: 'globe' | 'mercator';
		/** Themes to offer. Defaults to the four built in. */
		themes?: Record<string, BasemapTheme>;
		/** Offer a "none" option that drops the theme. Default `true`. */
		allowNoTheme?: boolean;
		/** Heading. Omit for no heading. */
		title?: string;
		/** Which corner to sit in when placed inside `<Map>`. Default `'top-left'`. */
		position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
		/** Hide the theme picker. */
		showTheme?: boolean;
		/** Hide the projection toggle. */
		showProjection?: boolean;
		/** Extra classes. */
		class?: string;
		/** Your own controls, below the built-in ones. */
		children?: Snippet;
	};

	let {
		theme = $bindable(null),
		projection = $bindable('globe'),
		themes = builtInThemes as unknown as Record<string, BasemapTheme>,
		allowNoTheme = true,
		title,
		position = 'top-left',
		showTheme = true,
		showProjection = true,
		class: className = '',
		children
	}: Props = $props();

	const names = $derived(Object.keys(themes));

	// A theme the caller supplied by hand is not in the list, so the select
	// shows "custom" rather than silently claiming to be one of the presets.
	const selected = $derived.by(() => {
		if (!theme) return 'none';
		return themeNameOf(theme) ?? 'custom';
	});

	function chooseTheme(value: string) {
		if (value === 'none') theme = null;
		else if (value !== 'custom') theme = themes[value] ?? null;
	}
</script>

<div class="mk-controls mk-controls--{position} {className}">
	{#if title}
		<h2 class="mk-controls__title">{title}</h2>
	{/if}

	{#if showTheme}
		<label class="mk-controls__row">
			<span>Theme</span>
			<select
				value={selected}
				onchange={(event) => chooseTheme((event.currentTarget as HTMLSelectElement).value)}
			>
				{#each names as name (name)}
					<option value={name}>{name}</option>
				{/each}
				{#if allowNoTheme}
					<option value="none">none</option>
				{/if}
				{#if selected === 'custom'}
					<option value="custom">custom</option>
				{/if}
			</select>
		</label>
	{/if}

	{#if showProjection}
		<div class="mk-controls__row" role="group" aria-label="Projection">
			<span>View</span>
			<div class="mk-controls__toggle">
				<button
					type="button"
					class:is-on={projection === 'globe'}
					aria-pressed={projection === 'globe'}
					onclick={() => (projection = 'globe')}
				>
					Globe
				</button>
				<button
					type="button"
					class:is-on={projection === 'mercator'}
					aria-pressed={projection === 'mercator'}
					onclick={() => (projection = 'mercator')}
				>
					Map
				</button>
			</div>
		</div>
	{/if}

	{#if children}
		<div class="mk-controls__extras">{@render children()}</div>
	{/if}
</div>

<style>
	.mk-controls {
		position: absolute;
		z-index: var(--mk-z-panel);
		display: flex;
		flex-direction: column;
		gap: var(--mk-space-2);
		min-width: 200px;
		padding: var(--mk-space-3) var(--mk-space-4);

		pointer-events: auto;
		background: var(--mk-panel-background, var(--mk-color-surface));
		color: var(--mk-color-text);
		font-family: var(--mk-font-family);
		font-size: var(--mk-font-size-sm);
		line-height: var(--mk-line-height);
		border: 1px solid var(--mk-color-border);
		border-radius: var(--mk-radius-lg);
		box-shadow: var(--mk-shadow-2);
	}

	.mk-controls--top-left {
		top: var(--mk-panel-inset, var(--mk-space-3));
		left: var(--mk-panel-inset, var(--mk-space-3));
	}
	.mk-controls--top-right {
		top: var(--mk-panel-inset, var(--mk-space-3));
		right: var(--mk-panel-inset, var(--mk-space-3));
	}
	.mk-controls--bottom-left {
		bottom: var(--mk-panel-inset, var(--mk-space-3));
		left: var(--mk-panel-inset, var(--mk-space-3));
	}
	.mk-controls--bottom-right {
		bottom: var(--mk-panel-inset, var(--mk-space-3));
		right: var(--mk-panel-inset, var(--mk-space-3));
	}

	.mk-controls__title {
		margin: 0;
		font-size: var(--mk-font-size-md);
		font-weight: var(--mk-font-weight-medium);
	}

	.mk-controls__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--mk-space-3);
	}

	.mk-controls__row > span {
		color: var(--mk-color-text-muted);
	}

	select {
		font: inherit;
		color: inherit;
		padding: 2px 4px;
		background: var(--mk-color-surface);
		border: 1px solid var(--mk-color-border);
		border-radius: var(--mk-radius-sm);
	}

	.mk-controls__toggle {
		display: inline-flex;
		border: 1px solid var(--mk-color-border);
		border-radius: var(--mk-radius-sm);
		overflow: hidden;
	}

	.mk-controls__toggle button {
		font: inherit;
		color: var(--mk-color-text-muted);
		padding: 2px 10px;
		border: 0;
		background: var(--mk-color-surface);
		cursor: pointer;
	}

	.mk-controls__toggle button.is-on {
		background: var(--mk-color-accent);
		color: var(--mk-color-accent-contrast);
	}

	.mk-controls__toggle button:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--mk-color-focus);
		outline-offset: 1px;
	}

	.mk-controls__extras {
		display: flex;
		flex-direction: column;
		gap: var(--mk-space-1);
		padding-top: var(--mk-space-1);
		border-top: 1px solid var(--mk-color-border);
	}
</style>
