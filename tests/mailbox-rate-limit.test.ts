import { describe, expect, it } from "vitest";
import { MailboxDO } from "../workers/durableObject";
import { Folders } from "../shared/folders";
import { MockDurableObjectStorage } from "./mock-durable-object-storage";

const mailboxWithSentMessages = async (dates: string[]) => {
	const storage = new MockDurableObjectStorage();
	const mailbox = new MailboxDO({ storage } as any, {} as any);

	for (const [index, date] of dates.entries()) {
		await mailbox.createEmail(
			Folders.SENT,
			{
				id: `sent-${index}`,
				subject: "Test message",
				sender: "sender@example.com",
				recipient: "recipient@example.com",
				date,
				body: "Test body",
			},
			[],
		);
	}

	return { mailbox, storage };
};

const ago = (milliseconds: number) =>
	new Date(Date.now() - milliseconds).toISOString();

const hours = (count: number) => count * 60 * 60 * 1000;

const days = (count: number) => count * 24 * 60 * 60 * 1000;

describe("MailboxDO.checkSendRateLimit", () => {
	it("counts ISO-8601 sent dates inside the hourly window", async () => {
		const { mailbox } = await mailboxWithSentMessages([ago(hours(59 / 60))]);

		expect(await mailbox.checkSendRateLimit()).toBeNull();
	});

	it("does not count sent dates outside the hourly window", async () => {
		const { mailbox } = await mailboxWithSentMessages(
			Array.from({ length: 20 }, () => ago(hours(61 / 60))),
		);

		expect(await mailbox.checkSendRateLimit()).toBeNull();
	});

	it("counts ISO-8601 sent dates inside the daily window", async () => {
		const { mailbox } = await mailboxWithSentMessages([ago(days(23 / 24))]);

		expect(await mailbox.checkSendRateLimit()).toBeNull();
	});

	it("does not count sent dates outside the daily window", async () => {
		const { mailbox } = await mailboxWithSentMessages([ago(days(25 / 24))]);

		expect(await mailbox.checkSendRateLimit()).toBeNull();
	});

	it("rejects the twentieth message in the hourly window", async () => {
		const { mailbox } = await mailboxWithSentMessages(
			Array.from({ length: 20 }, () => ago(hours(59 / 60))),
		);

		expect(await mailbox.checkSendRateLimit()).toBe(
			"Rate limit exceeded: max 20 emails per hour per mailbox",
		);
	});

	it("allows nineteen messages in the hourly window", async () => {
		const { mailbox } = await mailboxWithSentMessages(
			Array.from({ length: 19 }, () => ago(hours(59 / 60))),
		);

		expect(await mailbox.checkSendRateLimit()).toBeNull();
	});

	it("rejects the hundredth message in the daily window", async () => {
		const { mailbox } = await mailboxWithSentMessages(
			Array.from({ length: 100 }, () => ago(days(23 / 24))),
		);

		expect(await mailbox.checkSendRateLimit()).toBe(
			"Rate limit exceeded: max 100 emails per day per mailbox",
		);
	});

	it("allows ninety-nine messages in the daily window", async () => {
		const { mailbox } = await mailboxWithSentMessages(
			Array.from({ length: 99 }, () => ago(days(23 / 24))),
		);

		expect(await mailbox.checkSendRateLimit()).toBeNull();
	});

	it("keeps the ISO-8601 public message date unchanged", async () => {
		const date = ago(hours(59 / 60));
		const { mailbox } = await mailboxWithSentMessages([date]);

		expect((await mailbox.getEmail("sent-0"))?.date).toBe(date);
	});
});
