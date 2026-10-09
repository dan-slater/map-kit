<script lang="ts" generics="T = unknown">
	import type { Snippet } from 'svelte';
	import './tokens.css';

	type Props = {
		/** The thing the panel is about, usually the selected pin. */
		item?: T | null;
		/** Two-way open state. */
		open?: boolean;
		/** Which edge the panel sits on. Below 640px it becomes a bottom sheet either way. */
		position?: 'left' | 'right';
		/** Heading text. Ignored when you supply a `header` snippet. */
		title?: string;
		/** Show the close button. Default `true`. */
		closable?: boolean;
		/** Extra classes on the panel element. */
		class?: string;
		/** Accessible label when there is no visible title. */
		label?: string;
		onclose?: () => void;
		/** Replaces the whole header, title and close button included. */
		header?: Snippet<[T | null]>;
		/** The body, given the non-null item. */
		children?: Snippet<[T]>;
		/** Shown instead of `children` when `item` is null or undefined. */
		empty?: Snippet;
		/** Pinned below the body. */
		footer?: Snippet<[T | null]>;
	};

	let {
		item = null,
		open = $bindable(true),
		position = 'right',
		title,
		closable = true,
		class: className = '',
		label,
		onclose,
		header,
		children,
		empty,
		footer
	}: Props = $props();

	function close(): void {
		open = false;
		onclose?.();
	}
</script>

<aside
	class="mk-panel mk-panel--{position} {className}"
	class:mk-panel--open={open}
	aria-label={label ?? title}
	aria-hidden={!open}
	inert={!open}
>
	{#if header}
		{@render header(item)}
	{:else if title || closable}
		<div class="mk-panel__header">
			<h2 class="mk-panel__title">{title ?? ''}</h2>
			{#if closable}
				<button type="button" class="mk-panel__close" onclick={close} aria-label="Close panel">
					<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
						<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
					</svg>
				</button>
			{/if}
		</div>
	{/if}

	<div class="mk-panel__body">
		{#if item !== null && item !== undefined}
			{@render children?.(item)}
		{:else}
			{@render empty?.()}
		{/if}
	</div>

	{#if footer}
		<div class="mk-panel__footer">{@render footer(item)}</div>
	{/if}
</aside>

<style>
	.mk-panel {
		position: absolute;
		top: var(--mk-panel-inset, var(--mk-space-3));
		bottom: var(--mk-panel-inset, var(--mk-space-3));
		width: var(--mk-panel-width);
		max-width: calc(100% - 2 * var(--mk-panel-inset, var(--mk-space-3)));
		z-index: var(--mk-z-panel);

		display: flex;
		flex-direction: column;
		overflow: hidden;

		pointer-events: auto;
		background: var(--mk-panel-background, var(--mk-color-surface));
		color: var(--mk-color-text);
		font-family: var(--mk-font-family);
		font-size: var(--mk-font-size-md);
		line-height: var(--mk-line-height);
		border: 1px solid var(--mk-color-border);
		border-radius: var(--mk-radius-lg);
		box-shadow: var(--mk-shadow-2);

		transition:
			transform var(--mk-duration) var(--mk-easing),
			opacity var(--mk-duration) var(--mk-easing);
		opacity: 0;
	}

	.mk-panel--left {
		left: var(--mk-panel-inset, var(--mk-space-3));
		transform: translateX(calc(-100% - var(--mk-panel-inset, var(--mk-space-3))));
	}

	.mk-panel--right {
		right: var(--mk-panel-inset, var(--mk-space-3));
		transform: translateX(calc(100% + var(--mk-panel-inset, var(--mk-space-3))));
	}

	.mk-panel--open {
		transform: translateX(0);
		opacity: 1;
	}

	.mk-panel__header {
		display: flex;
		align-items: center;
		gap: var(--mk-space-2);
		padding: var(--mk-space-3) var(--mk-space-4);
		border-bottom: 1px solid var(--mk-color-border);
	}

	.mk-panel__title {
		flex: 1 1 auto;
		margin: 0;
		font-size: var(--mk-font-size-lg);
		font-weight: var(--mk-font-weight-medium);
		line-height: 1.25;
	}

	.mk-panel__close {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 0;
		border-radius: var(--mk-radius-sm);
		background: var(--mk-color-surface-muted);
		color: var(--mk-color-text-muted);
		cursor: pointer;
	}

	.mk-panel__close:hover {
		color: var(--mk-color-text);
	}

	.mk-panel__close:focus-visible {
		outline: 2px solid var(--mk-color-focus);
		outline-offset: 2px;
	}

	.mk-panel__close svg {
		width: 14px;
		height: 14px;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		fill: none;
	}

	.mk-panel__body {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		padding: var(--mk-space-4);
	}

	.mk-panel__footer {
		flex: 0 0 auto;
		padding: var(--mk-space-3) var(--mk-space-4);
		border-top: 1px solid var(--mk-color-border);
	}

	/*
	 * Narrow viewports get a bottom sheet. The breakpoint is a literal because
	 * media queries cannot read custom properties; override this rule in your
	 * own stylesheet if 640px is wrong for your layout.
	 */
	@media (max-width: 640px) {
		.mk-panel,
		.mk-panel--left,
		.mk-panel--right {
			top: auto;
			left: var(--mk-panel-inset, var(--mk-space-3));
			right: var(--mk-panel-inset, var(--mk-space-3));
			bottom: var(--mk-panel-inset, var(--mk-space-3));
			width: auto;
			max-width: none;
			max-height: var(--mk-sheet-max-height);
			transform: translateY(calc(100% + var(--mk-panel-inset, var(--mk-space-3))));
		}

		.mk-panel--open {
			transform: translateY(0);
		}

		/* A grab handle, so it reads as a sheet rather than a stuck card. */
		.mk-panel__header::before {
			content: '';
			position: absolute;
			top: var(--mk-space-1);
			left: 50%;
			width: 36px;
			height: 4px;
			border-radius: var(--mk-radius-pill);
			background: var(--mk-color-border);
			transform: translateX(-50%);
		}

		.mk-panel__header {
			position: relative;
			padding-top: var(--mk-space-4);
		}
	}
</style>
