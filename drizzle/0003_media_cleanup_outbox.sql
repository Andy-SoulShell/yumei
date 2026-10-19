CREATE TABLE `mediaDeletions` (
	`key` varchar(500) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mediaDeletions_key` PRIMARY KEY(`key`)
);
