// Markdown-lite for leader bios: the RichTextEditor toolbar writes these markers
// (**bold**, *italic*, "- " bullets, "1. " numbered lists, [text](https://url)),
// and this renders them to HTML. Input is HTML-escaped FIRST, so stored text can
// never inject markup ({@html} stays safe); links are restricted to http(s) or a
// same-site absolute path (e.g. an inline @mention linking to /some-leader).
const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// @mention links are written as [@Name](path) so the composer's raw markdown
// reads unambiguously as a mention, but the rendered/plain text drops the "@" —
// the link itself is the indicator, same convention as a normal hyperlink.
const stripMentionAt = (label: string) => (label.startsWith('@') ? label.slice(1) : label);

const inline = (s: string) =>
	s
		.replace(
			/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g,
			(_match, label, href) =>
				href.startsWith('/')
					? `<a href="${href}" class="text-primary hover:underline">${stripMentionAt(label)}</a>`
					: `<a href="${href}" target="_blank" rel="noopener nofollow" class="text-primary hover:underline">${stripMentionAt(label)}</a>`
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
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, (_match, label) => stripMentionAt(label))
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/^- /gm, '')
		.replace(/^\d+[.)] /gm, '')
		.replace(/\n+/g, ' ')
		.trim();
}
