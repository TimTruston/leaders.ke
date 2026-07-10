// Seeds dummy news mentions from src/lib/data/news.json. Mirrors `posts` (+ a
// `tags` row per mention). System-aggregated posts (null creatorId), same
// convention the real ingestion pipeline will use. Each row optionally names a
// leader to tag; when omitted, tags the first available leader so the PR desk
// and "In the news" sections have content in dev.
import { eq } from 'drizzle-orm';
import { posts, tags } from '../../src/lib/server/db/schema';
import { findAnyLeaderByName, findFirstLeader } from './people';
import type { AnyDb } from './names';
import newsData from '../../src/lib/data/news.json';

type NewsRow = {
	title: string;
	body: string;
	aiSummary: string;
	leaderName: string | null;
};

export async function seedNews(db: AnyDb) {
	let seeded = 0;
	let skipped = 0;

	for (const row of newsData as NewsRow[]) {
		const [existing] = await db.select({ id: posts.id }).from(posts).where(eq(posts.title, row.title));
		if (existing) {
			skipped++;
			continue;
		}

		const leader = row.leaderName ? await findAnyLeaderByName(db, row.leaderName) : await findFirstLeader(db);
		if (!leader) {
			console.warn(`no leader available to tag "${row.title}", skipping (no leaders seeded yet?)`);
			continue;
		}

		const [post] = await db
			.insert(posts)
			.values({ title: row.title, body: row.body, aiSummary: row.aiSummary, medium: 'web', approved: true, public: true })
			.returning({ id: posts.id });
		await db.insert(tags).values({ postId: post.id, leaderId: leader.id });
		seeded++;
	}

	console.log(`[news] seeded ${seeded}, skipped ${skipped} already-seeded`);
}
