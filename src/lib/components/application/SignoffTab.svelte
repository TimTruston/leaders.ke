<script lang="ts">
	// The applicant's attestation: who they are to the campaign, their national ID
	// number, and their own ID images. Rendered two ways:
	//  - embedded (apply family): nested under the current user's entry on the Team
	//    tab — its actions live on that route's +page.server.ts.
	//  - standalone (claim family): its own /claim/[slug]/signoff page, staged into
	//    the pending claim's evidence.
	// Either way `data` carries myRole/nationalId/idFrontUrl/idBackUrl and the host
	// route hosts the ?/saveMyDetails and ?/upload actions.
	import { enhance } from '$app/forms';
	import ImageCropper from '$lib/components/ImageCropper.svelte';
	import { CAMPAIGN_ROLES, isValidNationalId } from '$lib/utils/campaignRoles';

	let { data, form, embedded = false }: { data: any; form: any; embedded?: boolean } = $props();

	// Live format check as they type — same Invalid/Valid indicator design as EmailInput.
	let nationalId = $state(data.nationalId);
	const nationalIdInvalid = $derived(nationalId.length > 0 && !isValidNationalId(nationalId));

	const docs = $derived([
		{ kind: 'id-front', label: 'National ID front', url: data.idFrontUrl },
		{ kind: 'id-back', label: 'National ID back', url: data.idBackUrl }
	] as const);

	let uploading = $state(false);

	// Same crop-then-auto-upload flow as the Documentation tab: picking an image
	// opens the cropper, confirming submits — no separate upload button.
	let formEl: HTMLFormElement | undefined = $state();
	let inputs: Record<string, HTMLInputElement | undefined> = $state({});
	let cropping = $state<{ kind: string; file: File } | null>(null);

	function onFileChange(e: Event, kind: string) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = '';
		cropping = { kind, file };
	}

	function onCropConfirm(cropped: File) {
		if (!cropping) return;
		const input = inputs[cropping.kind];
		cropping = null;
		if (!input) return;
		const dt = new DataTransfer();
		dt.items.add(cropped);
		input.files = dt.files;
		formEl?.requestSubmit();
	}
</script>

<svelte:head>
	{#if !embedded}<title>Sign Off — leaders.ke</title>{/if}
</svelte:head>

<div>
	{#if embedded}
		<p class="text-sm font-semibold text-heading">Your sign-off</p>
		<p class="mt-0.5 text-xs text-muted">Confirm your role, national ID, and ID images to sign off this application.</p>
	{:else}
		<h1 class="text-xl font-bold text-heading">Sign Off</h1>
		<p class="mt-1 text-sm text-muted">Provide the following details to sign off this application.</p>
	{/if}

	<!-- Embedded, errors surface on the Team tab's own banner — avoid a duplicate. -->
	{#if form?.error && !embedded}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{:else if form?.detailsSaved}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Your details are saved.</div>
	{:else if form?.uploaded}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Uploaded.</div>
	{/if}

	<form
		bind:this={formEl}
		method="post"
		action="?/upload"
		enctype="multipart/form-data"
		class="mt-4 space-y-4"
		use:enhance={() => {
			uploading = true;
			return async ({ update }) => {
				uploading = false;
				await update({ reset: false });
			};
		}}
	>
		{#each docs as doc (doc.kind)}
			<div class="rounded-2xl border border-border bg-surface p-5">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="font-semibold text-sm text-heading">{doc.label} <span class={doc.url ? 'text-muted' : 'text-red-500'}>*</span></p>
						{#if doc.url}
							<a href={doc.url} target="_blank" rel="noopener" class="text-sm text-primary hover:underline">
								View uploaded file
							</a>
						{:else}
							<p class="text-sm text-muted">Not uploaded yet.</p>
						{/if}
					</div>
					<input
						type="file"
						name={doc.kind}
						accept="image/*"
						disabled={uploading}
						bind:this={inputs[doc.kind]}
						onchange={(e) => onFileChange(e, doc.kind)}
						class="max-w-60 text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-heading"
					/>
				</div>
			</div>
		{/each}

		{#if uploading}
			<p class="text-sm font-medium text-muted">Uploading…</p>
		{/if}
	</form>

	<form
		method="post"
		action="?/saveMyDetails"
		class="mt-4 rounded-2xl border border-border bg-surface p-5"
		use:enhance={() => {
			return async ({ update }) => {
				await update({ reset: false });
			};
		}}
	>
		<div class="flex flex-wrap items-end gap-2">
			<label class="min-w-48 flex-1">
				<span class="text-sm font-medium text-heading">My Role <span class={data.myRole ? 'text-muted' : 'text-red-500'}>*</span></span>
				<select
					name="myRole"
					required
					value={data.myRole}
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				>
					<option value="" disabled>Pick your role</option>
					{#each CAMPAIGN_ROLES as role (role)}
						<option value={role}>{role}</option>
					{/each}
				</select>
			</label>
			<label class="min-w-48 flex-1">
				<span class="text-sm font-medium text-heading">My National ID <span class={data.nationalId ? 'text-muted' : 'text-red-500'}>*</span></span>
				<div
					class="mt-1.5 flex items-stretch overflow-hidden rounded-xl border border-border bg-surface transition-colors
					focus-within:border-primary focus:ring-0 focus:ring-ring outline-hidden focus:outline-none"
				>
					<input
						type="text"
						name="nationalId"
						required
						bind:value={nationalId}
						placeholder="12345678"
						class="w-full border-0 bg-transparent px-4 py-2.5 text-sm text-heading placeholder:text-muted outline-hidden focus:ring-0 focus:outline-none"
					/>
					{#if nationalIdInvalid}
						<span class="grid place-items-center rounded-r-xl px-4 py-0.5 text-sm text-nowrap text-red-400">Invalid</span>
					{:else if nationalId}
						<span class="grid place-items-center rounded-r-xl px-4 py-0.5 text-sm text-nowrap text-primary">Valid</span>
					{/if}
				</div>
			</label>
			<button
				type="submit"
				class="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Save
			</button>
		</div>
	</form>
</div>

{#if cropping}
	<!-- National ID images crop to a landscape card ratio (~1.586:1, ISO/IEC 7810 ID-1). -->
	<ImageCropper file={cropping.file} aspect={1.58/1} onconfirm={onCropConfirm} oncancel={() => (cropping = null)} />
{/if}
