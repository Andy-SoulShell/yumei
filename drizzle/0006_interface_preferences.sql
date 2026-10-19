CREATE TABLE `userPreferences` (
	`userId` varchar(255) NOT NULL,
	`language` enum('system','zh-CN','en') NOT NULL DEFAULT 'system',
	`theme` enum('tokyo-sunset','sakura','midnight','neon-mint','crimson','sapphire','lava','pearl') NOT NULL DEFAULT 'tokyo-sunset',
	`colorMode` enum('system','light','dark') NOT NULL DEFAULT 'system',
	CONSTRAINT `userPreferences_userId` PRIMARY KEY(`userId`)
);
