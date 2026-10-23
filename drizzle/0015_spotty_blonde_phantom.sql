CREATE TABLE `coinCheckouts` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`packId` varchar(64) NOT NULL,
	`coins` int NOT NULL,
	`priceCents` int NOT NULL,
	`variantId` varchar(100) NOT NULL,
	`checkoutUrl` text NOT NULL,
	`status` enum('waiting','confirmed','refunded') NOT NULL DEFAULT 'waiting',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `coinCheckouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `coinOrders` ADD `netCents` int;--> statement-breakpoint
ALTER TABLE `coinOrders` ADD `checkoutId` varchar(36);--> statement-breakpoint
ALTER TABLE `communityCharacters` ADD `pendingSnapshot` json;--> statement-breakpoint
ALTER TABLE `communityCharacters` ADD `reviewVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `communityCharacters` ADD `submissionId` varchar(36);--> statement-breakpoint
ALTER TABLE `communityCharacters` ADD `submissionFingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `communityCharacters` ADD `reviewState` enum('pending','approved','rejected') DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE `coinCheckouts` ADD CONSTRAINT `coinCheckouts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_checkout_user_created` ON `coinCheckouts` (`userId`,`createdAt`);--> statement-breakpoint
UPDATE communityCharacters SET reviewState=CASE WHEN status='pending' THEN 'pending' WHEN status='rejected' THEN 'rejected' ELSE 'approved' END;
--> statement-breakpoint
UPDATE creatorEarnings SET units=FLOOR(units*100/COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(published,'$.billing.economy.coinsPerUsd')) FROM productConfiguration WHERE id='main'),100)), reversedUnits=FLOOR(reversedUnits*100/COALESCE((SELECT JSON_UNQUOTE(JSON_EXTRACT(published,'$.billing.economy.coinsPerUsd')) FROM productConfiguration WHERE id='main'),100));
--> statement-breakpoint
UPDATE creatorPayouts SET units=amountCents*10000;
