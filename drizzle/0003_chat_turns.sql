ALTER TABLE `generationRequests` MODIFY COLUMN `status` enum('pending','succeeded','failed','cancelled') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `generationStatus` enum('pending','succeeded','failed','stopped');--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `clientRequestId` varchar(36);--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `chatInput` text;--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `userMessageId` int;--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `assistantMessageId` int;--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `turnStatus` enum('queued','running','succeeded','stopped','failed');--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `cancelRequested` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `leaseToken` varchar(36);--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `leaseUntil` timestamp(3);--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `safetyNotice` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `revision` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `segments` json;--> statement-breakpoint
ALTER TABLE `generationRequests` ADD CONSTRAINT `uniq_generation_user_client` UNIQUE(`userId`,`clientRequestId`);--> statement-breakpoint
CREATE INDEX `idx_generation_turn_lease` ON `generationRequests` (`turnStatus`,`leaseUntil`);