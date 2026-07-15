// Markdown-lite for leader bios: the RichTextEditor toolbar writes these markers
// (**bold**, *italic*, "- " bullets, "1. " numbered lists, [text](https://url)),
// and this renders them to HTML. Input is HTML-escaped FIRST, so stored text can
// never inject markup ({@html} stays safe); links are restricted to http(s).
const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (s: string) =>
	s
		.replace(
			/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
			'<a href="$2" target="_blank" rel="noopener nofollow" class="text-primary hover:underline">$1</a>'
		)
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em>$1</em>');

/** Renders bio markdown-lite to safe HTML: paragraphs on blank lines, <br> on
 * single newlines, "- " blocks to <ul>, "1. " blocks to <ol>. */
export function renderRichText(input: string): string {
	if (!input) return '';
	const blocks = escapeHtml(input.trim()).split(/\n{2,}/);
	return blocks
		.map((block) => {
			const lines = block.split('\n');
			if (lines.every((l) => /^- /.test(l))) {
				return `<ul class="list-disc space-y-1 pl-5">${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
			}
			if (lines.every((l) => /^\d+[.)] /.test(l))) {
				return `<ol class="list-decimal space-y-1 pl-5">${lines.map((l) => `<li>${inline(l.replace(/^\d+[.)] /, ''))}</li>`).join('')}</ol>`;
			}
			return `<p>${lines.map(inline).join('<br>')}</p>`;
		})
		.join('');
}

/** Strips the markers for plain-text surfaces (card excerpts, compare snippets). */
export function plainText(input: string): string {
	if (!input) return '';
	return input
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/^- /gm, '')
		.replace(/^\d+[.)] /gm, '')
		.replace(/\n+/g, ' ')
		.trim();
}
