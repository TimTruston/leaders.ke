// Hand-curated Knowledge tab starter content (FAQ + source documents) for specific
// notable, already-seeded profiles — used to demo the AI Chat feature convincingly
// before a real campaign team has filled in their own. Sourced from public,
// verifiable material (the subject's own campaign site/bio PDF, Wikipedia, Mzalendo,
// and mainstream Kenyan press) — see the citations inline. Keyed by `users.slug`;
// seedNotableKnowledge (scripts/lib/seed-notable-knowledge.ts) resolves each slug and
// is a no-op for any that aren't seeded yet (e.g. on a partial `--leaders`-only run
// before `scraped` has run).
export type NotableFaq = { question: string; answer: string };
export type NotableDocument = { title: string; filename: string; content: string };

export const NOTABLE_KNOWLEDGE: Record<string, { faqs: NotableFaq[]; documents: NotableDocument[] }> = {
	'edwin-sifuna': {
		faqs: [
			{
				question: 'Who is Edwin Sifuna?',
				answer:
					'Edwin Watenya Sifuna (born 22 May 1982 in Mumias, Kakamega County) is the elected Senator for Nairobi City County, a practising advocate, and one of Kenya\'s most recognisable opposition voices. He was Secretary-General of the Orange Democratic Movement (ODM) from February 2018 until early 2026, and today convenes the Linda Mwananchi movement alongside Embakasi East MP Babu Owino and Siaya Governor James Orengo.'
			},
			{
				question: 'What is Edwin Sifuna\'s educational background?',
				answer:
					'He attended Kakamega Township Primary School and Musingu High School, then earned a Bachelor of Laws from the University of Nairobi (graduated 2006) and a Postgraduate Diploma in Law from the Kenya School of Law (2007). He completed his pupillage at Kairu & McCourt Advocates in Nairobi and was admitted to the Roll of Advocates in 2008.'
			},
			{
				question: 'What did Edwin Sifuna do before politics?',
				answer:
					'He practised law from 2008: first as Legal Affairs Manager at Magnate Ventures Limited, then as Legal & Administration Officer at Mini Group of Companies, before founding his own firm, E. Sifuna & Associates Advocates, where he remains managing partner. Within the Law Society of Kenya he led the OkoaLSK reform lobby, which restored member accountability and transparency to the Society, and he was part of the legal team that represented doctors during their 2017 100-day strike, helping broker an end to the impasse.'
			},
			{
				question: 'What is Edwin Sifuna\'s record as Nairobi Senator?',
				answer:
					'He was elected Nairobi Senator in the 2022 general election with 716,876 votes and was sworn in on 8 September 2022 — a comeback after narrowly missing the seat in 2017. In February 2023 he was appointed Deputy Minority Whip. He sits on the Senate\'s Energy Committee, County Public Accounts Committee, and National Security, Defence & Foreign Relations Committee, and an independent survey by the Leeway Africa Research Agency has ranked him among the country\'s best-performing senators for his floor and committee engagement.'
			},
			{
				question: 'What bills has Senator Sifuna sponsored?',
				answer:
					'He has sponsored the Office of the County Printer Bill, 2022 (Senate Bill No. 10 of 2022) to bring transparent, independent government-document procurement to counties; the Energy (Amendment) Bill, 2023 (No. 42); the Sports (Amendment) Bill, 2023/2024 (No. 33); and the Basic Education (Amendment) Act, 2024 — a legislative record spanning county governance, energy policy, sport, and education.'
			},
			{
				question: 'What role did Sifuna play in national dialogue between the government and opposition?',
				answer:
					'In May 2023 he was picked to lead the opposition side in bipartisan talks between the Azimio La Umoja Coalition and the Kenya Kwanza government — talks that led to the formation of the larger National Dialogue Committee (NADCO) tasked with resolving the country\'s key contentious political issues.'
			},
			{
				question: 'What is the Linda Mwananchi movement?',
				answer:
					'Linda Mwananchi ("protect the citizen") is a citizen-funded political movement Sifuna convenes with Babu Owino and James Orengo, focused on cost-of-living and taxation concerns and on keeping an independent opposition voice in Kenyan politics. It runs on small public donations through Paybill 3033049 — over Sh2.2 million raised from thousands of individual contributors in its first days — and has toured counties including Trans Nzoia, Bungoma, the Gusii region, Taita Taveta and Thika, drawing large crowds and endorsing local leaders such as Wundanyi MP Danson Mwashako for the Taita Taveta governorship in 2027.'
			},
			{
				question: 'Why did Edwin Sifuna leave the ODM Secretary-General position?',
				answer:
					'ODM\'s National Executive Committee relieved him of the Secretary-General role on 11 February 2026, a decision the Registrar of Political Parties upheld on 9 July 2026, after Sifuna publicly opposed the party\'s cooperation arrangement with the Kenya Kwanza government. He has been open about the disagreement being one of principle — that the opposition\'s oversight role shouldn\'t be traded away — and has channelled that stance into building Linda Mwananchi as an independent platform.'
			},
			{
				question: 'What does Edwin Sifuna stand for on women and youth empowerment?',
				answer:
					'He has consistently backed initiatives to widen political space for women and young people, including championing the "He for She" project run through ODM\'s Women League during his time as Secretary-General, and he has spoken often about creating conducive environments for women and youth to thrive in politics and leadership.'
			},
			{
				question: 'Is there polling on Edwin Sifuna\'s 2027 prospects?',
				answer:
					'An Infotrak poll reported in July 2026 found that a Kalonzo Musyoka–Edwin Sifuna ticket was already polling at 23%, a strong signal of momentum for Sifuna and the Linda Mwananchi movement heading into the 2027 election cycle.'
			},
			{
				question: 'Is Edwin Sifuna married?',
				answer: 'Yes — he is married with one daughter, and has spoken about a Catholic upbringing that instilled the values of hard work, integrity, credibility and honesty he says still guide him in public life.'
			},
			{
				question: 'How can citizens support the Linda Mwananchi movement?',
				answer:
					'The movement runs on small individual contributions rather than large donors — supporters can give any amount, from as little as Sh1, via Paybill 3033049. Recent fundraising drives have pulled in hundreds of thousands of shillings from thousands of ordinary contributors in a single day, which the movement points to as proof of genuine grassroots backing.'
			}
		],
		documents: [
			{
				title: 'Official Biography — Sen. Edwin Sifuna',
				filename: 'edwin-sifuna-official-bio.txt',
				content: `SEN. EDWIN WATENYA SIFUNA — SENATOR, NAIROBI CITY COUNTY
Source: edwinsifuna.com (official campaign biography), cross-checked against Wikipedia,
Mzalendo, and the Senate of Kenya's own member page.

Edwin Watenya Sifuna, born 22 May 1982 at St Mary's Hospital, Mumias, Kakamega County, is a
Kenyan politician and the elected Senator of Nairobi City County. He is a career lawyer, an
opposition strategist of a decade's standing, and — since ODM's National Executive Committee
relieved him of the party's Secretary-General role in February 2026 — the co-convener of the
Linda Mwananchi citizen movement.

EARLY LIFE AND EDUCATION
Raised in a working-class Catholic family — his father a civil servant with the then Municipal
Council, his mother a teacher — Sifuna attended Kakamega Township Primary School and Musingu
High School before reading law at the University of Nairobi, graduating with a Bachelor of Laws
in 2006. He completed a Postgraduate Diploma in Law at the Kenya School of Law in 2007, did his
pupillage at Kairu & McCourt Advocates in Nairobi, and was admitted to the Roll of Advocates in
2008.

LEGAL CAREER
He practised as Legal Affairs Manager at Magnate Ventures Limited for three years, then as Legal
& Administration Officer at Mini Group of Companies for a year, before founding his own Nairobi
practice, E. Sifuna & Associates Advocates, where he remains managing partner. Within the Law
Society of Kenya he led the OkoaLSK reform lobby, which returned power, accountability and
financial transparency to the Society's membership, and he was part of the legal team that
represented striking doctors during their 100-day impasse with the national government in 2017,
helping negotiate its resolution.

POLITICAL CAREER
Sifuna entered politics in the wake of the 2010 constitutional referendum, serving on the
technical/advisory committees of the CORD coalition (2013-2016) and later NASA (2016-2021) —
the backroom work of drafting coalition positions and agreements for the Raila Odinga-led
opposition. He first contested the Nairobi Senate seat in 2017, placing a strong runner-up with
674,056 votes (42.51%). In February 2018, at 35, he was appointed ODM Secretary-General,
becoming the party's chief spokesman, strategist and enforcer for the next eight years.

He returned to the ballot in 2022 and won the Nairobi Senate seat outright with 716,876 votes,
being sworn in on 8 September 2022. In February 2023 the Senate minority appointed him Deputy
Minority Whip. He serves on the Energy Committee, the County Public Accounts Committee, and the
National Security, Defence & Foreign Relations Committee, and an independent Leeway Africa
Research Agency survey has ranked him among Kenya's best-performing senators for his floor and
committee work.

LEGISLATIVE RECORD
He has sponsored the Office of the County Printer Bill, 2022 (Senate Bill No. 10 of 2022),
intended to give counties independent, transparent government-document procurement; the Energy
(Amendment) Bill, 2023 (No. 42); the Sports (Amendment) Bill, 2023/2024 (No. 33); and the Basic
Education (Amendment) Act, 2024.

NATIONAL DIALOGUE
In May 2023 he was chosen to lead the opposition side of bipartisan talks between the Azimio La
Umoja Coalition and the Kenya Kwanza government, work that led to the formation of the larger
National Dialogue Committee (NADCO) tasked with resolving the country's outstanding political
disputes.

VALUES
He has spoken often of the need to widen political space for women and young people, championing
the "He for She" project run through ODM's Women League during his time as Secretary-General, and
describes his politics as grounded in the hard work, integrity and honesty of his Catholic
upbringing.

PERSONAL LIFE
He is married with one daughter.`
			},
			{
				title: 'Linda Mwananchi Movement — Briefing',
				filename: 'linda-mwananchi-briefing.txt',
				content: `LINDA MWANANCHI — MOVEMENT BRIEFING (July 2026)
Sources: People Daily, The Star, Citizen Digital, Daily Nation, Breaking Kenya News.

WHAT IT IS
Linda Mwananchi ("protect the citizen") is a citizen-funded political movement co-convened by
Nairobi Senator Edwin Sifuna, Embakasi East MP Babu Owino, and Siaya Governor James Orengo. It
positions itself around defending Kenyans from the rising cost of living and taxation, and around
keeping an independent, accountable opposition voice in national politics — a stance that put its
leaders at odds with ODM's cooperation arrangement with the Kenya Kwanza government.

GRASSROOTS FUNDING
The movement is deliberately funded by small, individual contributions rather than large donors,
collected through Paybill 3033049. In one 12-hour push it raised roughly Sh519,144 from 9,419
contributors — an average gift of about Sh55, with donations as small as Sh1 — and within 36
hours cumulative giving passed Sh2.2 million. Organisers point to this as evidence of genuine,
broad-based public backing rather than elite financing.

COUNTY TOURS
Sifuna, Owino and Orengo have toured Trans Nzoia, Bungoma, the wider Gusii region, Taita Taveta
and Thika, drawing large crowds at each stop. During a Taita Taveta rally in Mwatate on 18 July
2026, the movement publicly endorsed Wundanyi MP Danson Mwashako for the Taita Taveta
governorship in 2027 — an early sign the movement intends to back candidates beyond its own
conveners.

POLITICAL MOMENTUM
An Infotrak poll reported in July 2026 put a Kalonzo Musyoka-Edwin Sifuna ticket at 23% support,
a notable early number for a movement that only recently detached from ODM's formal structures,
and reporting has noted a number of sitting MPs are said to be quietly sympathetic to the
movement's positions even where they haven't yet said so publicly.`
			}
		]
	}
};
