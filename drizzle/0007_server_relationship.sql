CREATE TABLE `voiceTranscriptions` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`text` text NOT NULL,
	`durationMs` int NOT NULL,
	`consumed` boolean NOT NULL DEFAULT false,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `voiceTranscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP INDEX `idx_moods_user_role` ON `girlfriendMoods`;--> statement-breakpoint
ALTER TABLE `generationRequests` ADD `transcriptionId` varchar(36);--> statement-breakpoint
ALTER TABLE `girlfriendMoods` ADD CONSTRAINT `uniq_moods_user_role` UNIQUE(`userId`,`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_transcription_expiry` ON `voiceTranscriptions` (`expiresAt`);