CREATE TABLE `omnivoiceVoices` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`name` varchar(80) NOT NULL,
	`referenceAudio` mediumtext NOT NULL,
	`referenceText` text NOT NULL,
	`durationMs` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `omnivoiceVoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `omnivoiceVoices` ADD CONSTRAINT `omnivoiceVoices_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_omnivoice_voices_user` ON `omnivoiceVoices` (`userId`);