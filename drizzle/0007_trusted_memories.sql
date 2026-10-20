CREATE TABLE `aiTaskRuns` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int,
	`kind` enum('memory_extract','memory_index','memory_query','summary') NOT NULL,
	`provider` varchar(32) NOT NULL,
	`model` varchar(200) NOT NULL,
	`isByok` boolean NOT NULL,
	`promptVersion` varchar(100) NOT NULL,
	`outcome` enum('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
	`durationMs` int,
	`usage` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiTaskRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companionPreferences` (
	`userId` varchar(255) NOT NULL,
	`timeZone` varchar(64) NOT NULL DEFAULT 'UTC',
	`proactiveEnabled` boolean NOT NULL DEFAULT false,
	`proactiveMode` enum('events','daily') NOT NULL DEFAULT 'events',
	`quietStart` int NOT NULL DEFAULT 1320,
	`quietEnd` int NOT NULL DEFAULT 480,
	`frequencyDays` int NOT NULL DEFAULT 1,
	`hidePrivatePreview` boolean NOT NULL DEFAULT true,
	`revision` int NOT NULL DEFAULT 0,
	CONSTRAINT `companionPreferences_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `conversationSummaries` (
	`conversationId` int NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`memoryEpoch` int NOT NULL,
	`throughMessageId` int NOT NULL,
	`content` text NOT NULL,
	`sources` json NOT NULL,
	`topics` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversationSummaries_conversationId` PRIMARY KEY(`conversationId`)
);
--> statement-breakpoint
CREATE TABLE `memoryEmbeddings` (
	`memoryId` int NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`contentVersion` int NOT NULL,
	`memoryEpoch` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`model` varchar(200) NOT NULL,
	`baseUrl` varchar(500) NOT NULL,
	`isByok` boolean NOT NULL,
	`dimensions` int NOT NULL,
	`vector` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memoryEmbeddings_memoryId` PRIMARY KEY(`memoryId`)
);
--> statement-breakpoint
ALTER TABLE `girlfriends` ADD `memoryEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `girlfriends` ADD `memoryEpoch` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `girlfriends` ADD `memoryForgottenThroughId` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `memories` ADD `contentVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `memories` ADD `factKey` varchar(64);--> statement-breakpoint
ALTER TABLE `memories` ADD `sourceType` enum('user_message','user_edit') DEFAULT 'user_message' NOT NULL;--> statement-breakpoint
ALTER TABLE `memories` ADD `sourceCreatedAt` timestamp(3);--> statement-breakpoint
ALTER TABLE `memories` ADD `sourceTimeZone` varchar(64) DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE `memories` ADD `eventDay` varchar(10);--> statement-breakpoint
ALTER TABLE `memories` ADD `eventStatus` enum('planned','completed','cancelled','unknown') DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `memoryExtractionJobs` ADD `memoryEpoch` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_ai_task_user_day` ON `aiTaskRuns` (`userId`,`createdAt`);