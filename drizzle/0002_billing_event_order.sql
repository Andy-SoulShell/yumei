CREATE TABLE `billingEvents` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`subscriptionId` varchar(64) NOT NULL,
	`eventName` varchar(64) NOT NULL,
	`occurredAt` timestamp(3),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `billingEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `providerUpdatedAt` timestamp(3);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `pastDueSince` timestamp(3);