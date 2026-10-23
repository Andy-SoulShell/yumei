CREATE TABLE `supportMessages` (
	`id` varchar(36) NOT NULL,
	`ticketId` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`author` enum('user','staff') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `supportMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supportTickets` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`category` enum('billing','account','technical') NOT NULL,
	`subject` varchar(120) NOT NULL,
	`orderReference` varchar(200),
	`status` enum('open','resolved') NOT NULL DEFAULT 'open',
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	`updatedAt` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `supportTickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `supportMessages` ADD CONSTRAINT `supportMessages_ticketId_supportTickets_id_fk` FOREIGN KEY (`ticketId`) REFERENCES `supportTickets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supportTickets` ADD CONSTRAINT `supportTickets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_support_message_ticket` ON `supportMessages` (`ticketId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_support_user_created` ON `supportTickets` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_support_status_created` ON `supportTickets` (`status`,`createdAt`);