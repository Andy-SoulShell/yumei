CREATE TABLE `proactiveContacts` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`localDay` varchar(10) NOT NULL,
	`reason` enum('event_upcoming','event_today','event_followup','daily') NOT NULL,
	`memoryId` int,
	`memoryVersion` int,
	`memorySourceMessageId` int,
	`eventDay` varchar(10),
	`memoryEpoch` int NOT NULL,
	`preferencesRevision` int NOT NULL,
	`notificationId` int NOT NULL,
	`status` enum('pending','delivering','sent','cancelled') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`leaseToken` varchar(36),
	`leaseUntil` timestamp(3),
	`nextRunAt` timestamp(3) NOT NULL DEFAULT (now()),
	`expiresAt` timestamp(3) NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `proactiveContacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_proactive_user_day` UNIQUE(`userId`,`localDay`)
);
--> statement-breakpoint
CREATE TABLE `proactiveDeliveries` (
	`id` varchar(36) NOT NULL,
	`contactId` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`subscriptionId` int NOT NULL,
	`deviceHash` varchar(64) NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`deliveredAt` timestamp(3),
	CONSTRAINT `proactiveDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_proactive_device` UNIQUE(`contactId`,`subscriptionId`,`deviceHash`)
);
--> statement-breakpoint
ALTER TABLE `aiTaskRuns` MODIFY COLUMN `kind` enum('memory_extract','memory_index','memory_query','summary','tts','transcription') NOT NULL;--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `contextEpoch` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD `contactId` varchar(36);--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_contactId_unique` UNIQUE(`contactId`);--> statement-breakpoint
CREATE INDEX `idx_proactive_next` ON `proactiveContacts` (`status`,`nextRunAt`);