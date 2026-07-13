// Admin "Subscriptions & revenue" tab: every subscription purchase/renewal/upgrade,
// plus a rollup of actual money collected (from the payments ledger, not subscriptions.amount,
// since payments is the source of truth for what was actually charged).
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import { campaigns, leaders, payments, subscriptions, users } from '$lib/server/db/schema';
import { fullName } from '$lib/server/leader';

export type SubscriptionRow = {
	id: number;
	campaignLeaderName: string;
	payerName: string;
	tier: string;
	billingCycle: string;
	amount: number;
	status: string;
	paidAt: string | null;
	endsAt: string;
};

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
	const payer = alias(users, 'payer');
	const rows = await db
		.select({
			id: subscriptions.id,
			tier: subscriptions.tier,
			billingCycle: subscriptions.billingCycle,
			amount: subscriptions.amount,
			status: subscriptions.status,
			paidAt: subscriptions.paidAt,
			endsAt: subscriptions.endsAt,
			payerFirstName: payer.firstName,
			payerOtherNames: payer.otherNames,
			leaderFirstName: users.firstName,
			leaderOtherNames: users.otherNames
		})
		.from(subscriptions)
		.innerJoin(campaigns, eq(subscriptions.campaignId, campaigns.id))
		.innerJoin(leaders, eq(campaigns.leaderId, leaders.id))
		.innerJoin(users, eq(leaders.userId, users.id))
		.innerJoin(payer, eq(subscriptions.payerId, payer.id))
		.orderBy(desc(subscriptions.createdAt));

	return rows.map((r) => ({
		id: r.id,
		campaignLeaderName: fullName({ firstName: r.leaderFirstName, otherNames: r.leaderOtherNames }),
		payerName: fullName({ firstName: r.payerFirstName, otherNames: r.payerOtherNames }),
		tier: r.tier,
		billingCycle: r.billingCycle,
		amount: r.amount,
		status: r.status,
		paidAt: r.paidAt ? r.paidAt.toISOString() : null,
		endsAt: r.endsAt.toISOString()
	}));
}

export type RevenueSummary = { totalAllTime: number; totalThisMonth: number };

export async function getRevenueSummary(): Promise<RevenueSummary> {
	const startOfMonth = new Date();
	startOfMonth.setDate(1);
	startOfMonth.setHours(0, 0, 0, 0);

	const [[allTime], [thisMonth]] = await Promise.all([
		db
			.select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
			.from(payments)
			.where(eq(payments.status, 'success')),
		db
			.select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
			.from(payments)
			.where(and(eq(payments.status, 'success'), gte(payments.paidAt, startOfMonth)))
	]);

	return { totalAllTime: Number(allTime.total), totalThisMonth: Number(thisMonth.total) };
}
