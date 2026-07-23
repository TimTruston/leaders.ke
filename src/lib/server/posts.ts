// Public /news identity for a web post. Separate from leader.ts's slug (that one's
// permanent per-person; a post's is permanent per-post, generated once at creation).
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { posts } from '$lib/server/db/schema';
import { slugify } from '$lib/server/leader';

/** Generates a post's permanent /news/[slug], suffixing "-2", "-3"... on collision. */
export async function generatePostSlug(title: string): Promise<string> {
	const base = slugify(title) || 'post';
	let candidate = base;
	let n = 1;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const [existing] = await db
			.select({ id: posts.id })
			.from(posts)
			.where(and(eq(posts.slug, candidate), isNull(posts.deletedAt)));
		if (!existing) return candidate;
		n += 1;
		candidate = `${base}-${n}`;
	}
}
