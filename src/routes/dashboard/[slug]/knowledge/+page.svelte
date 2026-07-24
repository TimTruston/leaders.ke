<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let addingFaq = $state(false);
	let uploading = $state(false);
	let faqQuestion = $state('');
	let faqAnswer = $state('');
	let docTitle = $state('');
	let fileInputEl: HTMLInputElement | undefined = $state();

	let linkUrl = $state('');
	let fetchingLink = $state(false);
	let savingLink = $state(false);
	// The fetched-but-not-yet-saved preview — editable before the team commits it
	// as a document. Reset whenever a fresh fetch succeeds or the save completes.
	let linkPreview = $state<{ kind: 'youtube' | 'link'; title: string; content: string; sourceUrl: string } | null>(null);
	$effect(() => {
		if (form && 'previewed' in form && form.previewed) linkPreview = { ...form.preview };
	});
</script>

<svelte:head><title>Knowledge — leaders.ke</title></svelte:head>

<div>
	<h2 class="text-xl font-bold text-heading">Knowledge</h2>
	<p class="text-sm text-muted">What the AI Chat feature knows and answers from — nothing more, nothing less.</p>

	<!-- Friendly, plain-language framing up front — this is the single place most
	     leaders/managers will misjudge or fear the AI feature, so it's addressed
	     before any form, not buried in a tooltip. -->
	<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-5 text-sm text-muted">
		<p class="font-semibold text-heading">How this works, in plain terms</p>
		<ul class="mt-2 list-disc space-y-1 pl-5">
			<li>Citizens can ask an AI questions about {data.faqs.length > 0 || data.documents.length > 0 ? 'this campaign' : 'campaigns'} on the public profile page.</li>
			<li>The AI only answers from what's on this page, plus the Leader, Contacts, Delivery, Campaign, News, Broadcasts, Reviews and Competition tabs — never anything it wasn't given.</li>
			<li>It never invents facts, promises, or positions. If something isn't written here, it says so and points citizens to follow the campaign instead.</li>
			<li>Nothing here is published on its own — it only ever surfaces as an AI-written answer to a citizen's specific question.</li>
		</ul>
	</div>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{form.error}</div>
	{/if}

	<!-- FAQ builder -->
	<div class="mt-6 rounded-2xl border border-border bg-surface p-5">
		<h3 class="font-semibold text-heading">Frequently asked questions</h3>
		<p class="mt-1 text-sm text-muted">Answer the questions citizens ask most — the AI leans on these first.</p>

		{#if data.faqs.length === 0}
			<p class="mt-3 text-sm text-muted">No FAQs yet.</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.faqs as faq (faq.id)}
					<li class="rounded-xl bg-surface-2 p-4 text-sm">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="font-medium text-heading">{faq.question}</p>
								<p class="mt-1 text-muted">{faq.answer}</p>
							</div>
							<form
								method="post"
								action="?/removeFaq"
								use:enhance={() => async ({ update }) => update()}
							>
								<input type="hidden" name="id" value={faq.id} />
								<button type="submit" class="shrink-0 text-xs font-semibold text-muted hover:text-heading">Remove</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="post"
			action="?/addFaq"
			class="mt-4 space-y-3 border-t border-border pt-4"
			use:enhance={() => {
				addingFaq = true;
				return async ({ result, update }) => {
					addingFaq = false;
					if (result.type === 'success') {
						faqQuestion = '';
						faqAnswer = '';
					}
					await update({ reset: false });
				};
			}}
		>
			<label class="block">
				<span class="text-sm font-medium text-heading">Question</span>
				<input
					type="text"
					name="question"
					bind:value={faqQuestion}
					placeholder="What is your plan for youth unemployment?"
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-heading">Answer</span>
				<textarea
					name="answer"
					bind:value={faqAnswer}
					rows="3"
					placeholder="Write the answer exactly as you'd want a citizen to read it — the AI may reuse this wording directly."
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				></textarea>
			</label>
			<button
				type="submit"
				disabled={!faqQuestion.trim() || !faqAnswer.trim() || addingFaq}
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{addingFaq ? 'Adding…' : 'Add FAQ'}
			</button>
		</form>
	</div>

	<!-- Document uploads -->
	<div class="mt-6 rounded-2xl border border-border bg-surface p-5">
		<h3 class="font-semibold text-heading">Source documents</h3>
		<p class="mt-1 text-sm text-muted">
			Manifestos, policy briefs, position papers. PDF, .txt or .md — under 10 MB. Text is pulled out automatically and
			feeds the AI right away; a scanned PDF with no real text layer won't have anything to extract.
		</p>

		{#if data.documents.length === 0}
			<p class="mt-3 text-sm text-muted">No documents yet.</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.documents as doc (doc.id)}
					<li class="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-4 text-sm">
						<div class="min-w-0">
							<a href={doc.fileUrl} target="_blank" rel="noopener" class="font-medium text-heading hover:underline">{doc.title}</a>
							<p class="mt-0.5 text-xs text-muted">
								{doc.mimeType}
								{#if doc.textReady}· feeding the AI{:else}· not readable by the AI yet{/if}
							</p>
						</div>
						<form
							method="post"
							action="?/removeDocument"
							use:enhance={() => async ({ update }) => update()}
						>
							<input type="hidden" name="id" value={doc.id} />
							<button type="submit" class="shrink-0 text-xs font-semibold text-muted hover:text-heading">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="post"
			action="?/uploadDocument"
			enctype="multipart/form-data"
			class="mt-4 space-y-3 border-t border-border pt-4"
			use:enhance={() => {
				uploading = true;
				return async ({ result, update }) => {
					uploading = false;
					if (result.type === 'success') {
						docTitle = '';
						if (fileInputEl) fileInputEl.value = '';
					}
					await update({ reset: false });
				};
			}}
		>
			<label class="block">
				<span class="text-sm font-medium text-heading">Title</span>
				<input
					type="text"
					name="title"
					bind:value={docTitle}
					placeholder="2027 Manifesto (full)"
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-heading">File</span>
				<input
					type="file"
					name="file"
					accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
					bind:this={fileInputEl}
					class="mt-1.5 block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-on-primary"
				/>
			</label>
			<button
				type="submit"
				disabled={!docTitle.trim() || uploading}
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{uploading ? 'Uploading…' : 'Upload document'}
			</button>
		</form>

		<!-- From a link: fetches and shows the extracted text for review — nothing is
		     saved until the team confirms, since a page's text can come out messy and
		     is worth a glance before it becomes something the AI quotes from. -->
		<div class="mt-6 border-t border-border pt-4">
			<h4 class="text-sm font-semibold text-heading">From a link</h4>
			<p class="mt-1 text-sm text-muted">
				Paste an article, manifesto page, or YouTube video. YouTube links pull the title, description, and a
				transcript when one is available.
			</p>
			<form
				method="post"
				action="?/previewLink"
				class="mt-3 flex flex-col gap-2 sm:flex-row"
				use:enhance={() => {
					fetchingLink = true;
					linkPreview = null;
					return async ({ update }) => {
						fetchingLink = false;
						await update({ reset: false });
					};
				}}
			>
				<input
					type="url"
					name="url"
					bind:value={linkUrl}
					placeholder="https://…"
					class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
				<button
					type="submit"
					disabled={!linkUrl.trim() || fetchingLink}
					class="shrink-0 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface-2 disabled:opacity-60"
				>
					{fetchingLink ? 'Fetching…' : 'Fetch'}
				</button>
			</form>

			{#if linkPreview}
				<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4">
					<p class="text-xs font-semibold text-muted uppercase">
						{linkPreview.kind === 'youtube' ? 'YouTube — review before saving' : 'Review before saving'}
					</p>
					<label class="mt-2 block">
						<span class="text-xs font-medium text-muted">Title</span>
						<input
							type="text"
							bind:value={linkPreview.title}
							class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
					</label>
					<label class="mt-2 block">
						<span class="text-xs font-medium text-muted">Extracted text (edit freely before saving)</span>
						<textarea
							bind:value={linkPreview.content}
							rows="8"
							class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						></textarea>
					</label>
					<div class="mt-3 flex gap-2">
						<form
							method="post"
							action="?/addLink"
							use:enhance={() => {
								savingLink = true;
								return async ({ result, update }) => {
									savingLink = false;
									if (result.type === 'success') {
										linkPreview = null;
										linkUrl = '';
									}
									await update({ reset: false });
								};
							}}
						>
							<input type="hidden" name="title" value={linkPreview.title} />
							<input type="hidden" name="content" value={linkPreview.content} />
							<input type="hidden" name="sourceUrl" value={linkPreview.sourceUrl} />
							<button
								type="submit"
								disabled={!linkPreview.title.trim() || !linkPreview.content.trim() || savingLink}
								class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
							>
								{savingLink ? 'Saving…' : 'Save as document'}
							</button>
						</form>
						<button
							type="button"
							onclick={() => (linkPreview = null)}
							class="rounded-full border border-border bg-surface px-5 py-2 text-sm font-semibold text-heading transition hover:bg-surface-2"
						>
							Discard
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
