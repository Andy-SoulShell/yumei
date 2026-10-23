CREATE TABLE `coinInvoices` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`subscriptionId` varchar(64) NOT NULL,
	`applied` boolean NOT NULL DEFAULT false,
	`reversed` boolean NOT NULL DEFAULT false,
	CONSTRAINT `coinInvoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `coinInvoices` ADD CONSTRAINT `coinInvoices_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;