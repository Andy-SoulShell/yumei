CREATE TABLE `coinLedger` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`eventKey` varchar(160) NOT NULL,
	`reason` varchar(32) NOT NULL,
	`paidDelta` int NOT NULL,
	`bonusDelta` int NOT NULL,
	`balanceAfter` int NOT NULL,
	`allocations` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coinLedger_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_coin_user_event` UNIQUE(`userId`,`eventKey`)
);
--> statement-breakpoint
CREATE TABLE `coinOrders` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`coins` int NOT NULL,
	`consumed` int NOT NULL DEFAULT 0,
	`revoked` int NOT NULL DEFAULT 0,
	`totalCents` int NOT NULL,
	`refundedCents` int NOT NULL DEFAULT 0,
	`variantId` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coinOrders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coinWallets` (
	`userId` varchar(255) NOT NULL,
	`paid` int NOT NULL DEFAULT 0,
	`bonus` int NOT NULL DEFAULT 0,
	`referralCode` varchar(32) NOT NULL,
	CONSTRAINT `coinWallets_userId` PRIMARY KEY(`userId`),
	CONSTRAINT `coinWallets_referralCode_unique` UNIQUE(`referralCode`)
);
--> statement-breakpoint
CREATE TABLE `communityCharacters` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`sourceId` int NOT NULL,
	`status` enum('pending','published','rejected','unlisted') NOT NULL DEFAULT 'pending',
	`snapshot` json NOT NULL,
	`moderationNote` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `communityCharacters_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_community_owner_source` UNIQUE(`userId`,`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `creatorEarnings` (
	`id` varchar(128) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`requestId` varchar(36) NOT NULL,
	`orderId` varchar(64) NOT NULL,
	`units` bigint NOT NULL,
	`reversedUnits` bigint NOT NULL DEFAULT 0,
	`availableAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `creatorEarnings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creatorPayouts` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`units` bigint NOT NULL,
	`amountCents` int NOT NULL,
	`status` enum('requested','paid','rejected') NOT NULL DEFAULT 'requested',
	`reference` varchar(200),
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `creatorPayouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creatorProfiles` (
	`userId` varchar(255) NOT NULL,
	`handle` varchar(32) NOT NULL,
	`displayName` varchar(80) NOT NULL,
	`bio` varchar(500) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `creatorProfiles_userId` PRIMARY KEY(`userId`),
	CONSTRAINT `creatorProfiles_handle_unique` UNIQUE(`handle`)
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`inviteeId` varchar(255) NOT NULL,
	`inviterId` varchar(255) NOT NULL,
	`status` enum('pending','rewarded','revoked') NOT NULL DEFAULT 'pending',
	`orderId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referrals_inviteeId` PRIMARY KEY(`inviteeId`)
);
--> statement-breakpoint
ALTER TABLE `girlfriends` ADD `communitySourceId` varchar(36);--> statement-breakpoint
ALTER TABLE `girlfriends` ADD `creationRequestId` varchar(36);--> statement-breakpoint
ALTER TABLE `girlfriends` ADD `creationFingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `girlfriends` ADD CONSTRAINT `idx_role_user_creation` UNIQUE(`userId`,`creationRequestId`);--> statement-breakpoint
ALTER TABLE `coinLedger` ADD CONSTRAINT `coinLedger_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coinOrders` ADD CONSTRAINT `coinOrders_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coinWallets` ADD CONSTRAINT `coinWallets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communityCharacters` ADD CONSTRAINT `communityCharacters_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creatorEarnings` ADD CONSTRAINT `creatorEarnings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creatorPayouts` ADD CONSTRAINT `creatorPayouts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creatorProfiles` ADD CONSTRAINT `creatorProfiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_inviteeId_users_id_fk` FOREIGN KEY (`inviteeId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_inviterId_users_id_fk` FOREIGN KEY (`inviterId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;