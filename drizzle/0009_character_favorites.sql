CREATE TABLE `characterFavorites` (
	`userId` varchar(255) NOT NULL,
	`presetId` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `idx_character_favorite_user_preset` UNIQUE(`userId`,`presetId`)
);
--> statement-breakpoint
ALTER TABLE `characterFavorites` ADD CONSTRAINT `characterFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;