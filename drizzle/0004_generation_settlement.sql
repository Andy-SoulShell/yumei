CREATE TABLE `generationRequests` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`conversationId` int NOT NULL,
	`kind` enum('chat','selfie','couple') NOT NULL,
	`status` enum('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
	`meterPeriod` varchar(10),
	`meterName` varchar(64),
	`outputKey` varchar(500),
	`temporaryKey` varchar(500),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generationRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `generationRequestId` varchar(36);--> statement-breakpoint
ALTER TABLE `messages` ADD `generationStatus` enum('succeeded','failed');