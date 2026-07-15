<script lang="ts">
	// Free-aspect crop modal for image uploads (Documentation tab): drag the box to
	// move, drag the corner handle to resize, confirm to get a cropped JPEG File.
	// Dependency-free — a positioned overlay + canvas re-draw at natural resolution.
	let {
		file,
		onconfirm,
		oncancel
	}: {
		file: File;
		/** Receives the cropped image as a File (same name, image/jpeg). */
		onconfirm: (cropped: File) => void;
		oncancel: () => void;
	} = $props();

	const url = URL.createObjectURL(file);

	let imgEl: HTMLImageElement | undefined = $state();
	let rect = $state({ x: 0, y: 0, w: 0, h: 0 }); // displayed-pixel space, relative to the img
	let drag: { mode: 'move' | 'resize'; startX: number; startY: number; orig: typeof rect } | null = null;

	// Start with a box covering most of the image.
	function init() {
		if (!imgEl) return;
		const w = imgEl.clientWidth;
		const h = imgEl.clientHeight;
		rect = { x: w * 0.1, y: h * 0.1, w: w * 0.8, h: h * 0.8 };
	}

	function down(e: PointerEvent, mode: 'move' | 'resize') {
		e.preventDefault();
		e.stopPropagation();
		drag = { mode, startX: e.clientX, startY: e.clientY, orig: { ...rect } };
	}

	function move(e: PointerEvent) {
		if (!drag || !imgEl) return;
		const dx = e.clientX - drag.startX;
		const dy = e.clientY - drag.startY;
		const maxW = imgEl.clientWidth;
		const maxH = imgEl.clientHeight;
		if (drag.mode === 'move') {
			rect.x = Math.min(Math.max(0, drag.orig.x + dx), maxW - rect.w);
			rect.y = Math.min(Math.max(0, drag.orig.y + dy), maxH - rect.h);
		} else {
			rect.w = Math.min(Math.max(24, drag.orig.w + dx), maxW - rect.x);
			rect.h = Math.min(Math.max(24, drag.orig.h + dy), maxH - rect.y);
		}
	}

	function up() {
		drag = null;
	}

	function confirmCrop() {
		if (!imgEl) return;
		// Displayed-space box → natural-resolution pixels, so quality is preserved.
		const scaleX = imgEl.naturalWidth / imgEl.clientWidth;
		const scaleY = imgEl.naturalHeight / imgEl.clientHeight;
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(rect.w * scaleX));
		canvas.height = Math.max(1, Math.round(rect.h * scaleY));
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(imgEl, rect.x * scaleX, rect.y * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
		canvas.toBlob(
			(blob) => {
				if (!blob) return;
				URL.revokeObjectURL(url);
				const base = file.name.replace(/\.[^.]+$/, '');
				onconfirm(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
			},
			'image/jpeg',
			0.92
		);
	}

	function cancel() {
		URL.revokeObjectURL(url);
		oncancel();
	}
</script>

<svelte:window onpointermove={move} onpointerup={up} />

<div class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
	<div class="w-full max-w-lg rounded-2xl bg-surface p-4">
		<p class="mb-3 text-sm font-semibold text-heading">Crop before uploading</p>
		<div class="grid place-items-center">
			<div class="relative inline-block touch-none select-none">
				<img src={url} bind:this={imgEl} onload={init} draggable="false" class="max-h-[55vh] w-auto" alt="Crop preview" />
				<div
					class="absolute cursor-move border-2 border-primary bg-primary/10"
					style="left:{rect.x}px;top:{rect.y}px;width:{rect.w}px;height:{rect.h}px"
					onpointerdown={(e) => down(e, 'move')}
				>
					<div
						class="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-surface bg-primary"
						onpointerdown={(e) => down(e, 'resize')}
					></div>
				</div>
			</div>
		</div>
		<div class="mt-4 flex justify-end gap-2">
			<button
				type="button"
				onclick={cancel}
				class="rounded-full border border-border px-5 py-2 text-sm font-semibold text-heading transition hover:bg-surface-2"
			>
				Cancel
			</button>
			<button
				type="button"
				onclick={confirmCrop}
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Crop & upload
			</button>
		</div>
	</div>
</div>
