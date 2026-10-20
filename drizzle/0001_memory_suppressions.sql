CREATE TABLE `memorySuppressions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`contentHash` varchar(64) NOT NULL,
	`sourceMessageId` int,
	`throughMessageId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memorySuppressions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_memory_suppression` UNIQUE(`girlfriendId`,`contentHash`)
);
--> statement-breakpoint
CREATE INDEX `idx_memory_suppression_user` ON `memorySuppressions` (`userId`);