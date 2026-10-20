CREATE TABLE `accounts` (
	`id` varchar(255) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`accountId` varchar(255) NOT NULL,
	`providerId` varchar(64) NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` timestamp,
	`refreshTokenExpiresAt` timestamp,
	`scope` text,
	`password` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiTaskRuns` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int,
	`kind` enum('memory_extract','memory_index','memory_query','summary','tts','transcription') NOT NULL,
	`provider` varchar(32) NOT NULL,
	`model` varchar(200) NOT NULL,
	`isByok` boolean NOT NULL,
	`promptVersion` varchar(100) NOT NULL,
	`outcome` enum('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
	`durationMs` int,
	`usage` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiTaskRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `apiConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`llmModel` varchar(200),
	`ttsProvider` enum('browser','elevenlabs','fishaudio') NOT NULL DEFAULT 'browser',
	`elevenlabsVoiceId` varchar(200),
	`elevenlabsVoiceName` varchar(200),
	`fishAudioModelId` varchar(200),
	`fishAudioModelName` varchar(200),
	`globalPrompt` text,
	`replyLanguage` varchar(50) DEFAULT '中文',
	`replyLengthLimit` varchar(50) DEFAULT '50-100字',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apiConfigs_id` PRIMARY KEY(`id`),
	CONSTRAINT `apiConfigs_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `billingEvents` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`subscriptionId` varchar(64) NOT NULL,
	`eventName` varchar(64) NOT NULL,
	`occurredAt` timestamp(3),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `billingEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companionPreferences` (
	`userId` varchar(255) NOT NULL,
	`timeZone` varchar(64) NOT NULL DEFAULT 'UTC',
	`proactiveEnabled` boolean NOT NULL DEFAULT false,
	`proactiveMode` enum('events','daily') NOT NULL DEFAULT 'events',
	`quietStart` int NOT NULL DEFAULT 1320,
	`quietEnd` int NOT NULL DEFAULT 480,
	`frequencyDays` int NOT NULL DEFAULT 1,
	`hidePrivatePreview` boolean NOT NULL DEFAULT true,
	`revision` int NOT NULL DEFAULT 0,
	CONSTRAINT `companionPreferences_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `conversationSummaries` (
	`conversationId` int NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`memoryEpoch` int NOT NULL,
	`throughMessageId` int NOT NULL,
	`content` text NOT NULL,
	`sources` json NOT NULL,
	`topics` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversationSummaries_conversationId` PRIMARY KEY(`conversationId`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`title` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generationRequests` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`conversationId` int NOT NULL,
	`transcriptionId` varchar(36),
	`kind` enum('chat','selfie','couple') NOT NULL,
	`contextEpoch` int,
	`status` enum('pending','succeeded','failed','cancelled') NOT NULL DEFAULT 'pending',
	`meterPeriod` varchar(10),
	`meterName` varchar(64),
	`clientRequestId` varchar(36),
	`chatInput` text,
	`chatRouting` json,
	`userMessageId` int,
	`assistantMessageId` int,
	`turnStatus` enum('queued','running','succeeded','stopped','failed'),
	`cancelRequested` boolean NOT NULL DEFAULT false,
	`leaseToken` varchar(36),
	`leaseUntil` timestamp(3),
	`safetyNotice` boolean NOT NULL DEFAULT false,
	`revision` int NOT NULL DEFAULT 0,
	`turnRelationship` json,
	`telemetry` json,
	`outputKey` varchar(500),
	`temporaryKey` varchar(500),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generationRequests_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_generation_user_client` UNIQUE(`userId`,`clientRequestId`)
);
--> statement-breakpoint
CREATE TABLE `girlfriendMoods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`mood` enum('excited','happy','content','neutral','lonely','sad') NOT NULL DEFAULT 'happy',
	`moodScore` int NOT NULL DEFAULT 70,
	`emotionState` json,
	`lastChatAt` timestamp,
	`totalMessages` int NOT NULL DEFAULT 0,
	`todayMessages` int NOT NULL DEFAULT 0,
	`lastMoodUpdate` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `girlfriendMoods_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_moods_user_role` UNIQUE(`userId`,`girlfriendId`)
);
--> statement-breakpoint
CREATE TABLE `girlfriends` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`name` varchar(100) NOT NULL,
	`personality` text NOT NULL,
	`appearance` text NOT NULL,
	`interests` text,
	`referenceImageUrl` text NOT NULL,
	`referenceImageKey` varchar(500) NOT NULL,
	`customPrompt` text,
	`behavior` json,
	`memoryEnabled` boolean NOT NULL DEFAULT true,
	`memoryEpoch` int NOT NULL DEFAULT 0,
	`memoryForgottenThroughId` int NOT NULL DEFAULT 0,
	`avatarUrl` text,
	`avatarKey` varchar(500),
	`intimacyLevel` int NOT NULL DEFAULT 1,
	`intimacyPoints` int NOT NULL DEFAULT 0,
	`lastInteractionAt` timestamp,
	`consecutiveDays` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `girlfriends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mediaDeletions` (
	`key` varchar(500) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`availableAt` timestamp(3) NOT NULL DEFAULT (now()),
	`deleting` boolean NOT NULL DEFAULT false,
	`leaseUntil` timestamp(3),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mediaDeletions_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`category` enum('fact','preference','event','relationship') NOT NULL DEFAULT 'fact',
	`content` varchar(300) NOT NULL,
	`weight` int NOT NULL DEFAULT 50,
	`pinned` boolean NOT NULL DEFAULT false,
	`sourceMessageId` int,
	`contentVersion` int NOT NULL DEFAULT 1,
	`factKey` varchar(64),
	`sourceType` enum('user_message','user_edit') NOT NULL DEFAULT 'user_message',
	`sourceCreatedAt` timestamp(3),
	`sourceTimeZone` varchar(64) NOT NULL DEFAULT 'UTC',
	`eventDay` varchar(10),
	`eventStatus` enum('planned','completed','cancelled','unknown') NOT NULL DEFAULT 'unknown',
	`lastRecalledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_memory_dedupe` UNIQUE(`girlfriendId`,`content`)
);
--> statement-breakpoint
CREATE TABLE `memoryEmbeddings` (
	`memoryId` int NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`contentVersion` int NOT NULL,
	`memoryEpoch` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`model` varchar(200) NOT NULL,
	`baseUrl` varchar(500) NOT NULL,
	`isByok` boolean NOT NULL,
	`dimensions` int NOT NULL,
	`vector` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memoryEmbeddings_memoryId` PRIMARY KEY(`memoryId`)
);
--> statement-breakpoint
CREATE TABLE `memoryExtractionJobs` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`conversationId` int NOT NULL,
	`lastMessageId` int NOT NULL,
	`intimacyLevel` int NOT NULL,
	`memoryEpoch` int NOT NULL DEFAULT 0,
	`attempts` int NOT NULL DEFAULT 0,
	`status` enum('pending','failed') NOT NULL DEFAULT 'pending',
	`leaseToken` varchar(36),
	`leaseUntil` timestamp(3),
	`nextRunAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `memoryExtractionJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`imageUrl` text,
	`imageKey` varchar(500),
	`generationRequestId` varchar(36),
	`generationStatus` enum('pending','succeeded','failed','stopped'),
	`segments` json,
	`selfieMode` enum('mirror','direct'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` varchar(36),
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`title` json NOT NULL,
	`content` json NOT NULL,
	`type` enum('miss_you','good_morning','good_night','random','mood') NOT NULL DEFAULT 'random',
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_contactId_unique` UNIQUE(`contactId`)
);
--> statement-breakpoint
CREATE TABLE `proactiveContacts` (
	`id` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`localDay` varchar(10) NOT NULL,
	`reason` enum('event_upcoming','event_today','event_followup','daily') NOT NULL,
	`memoryId` int,
	`memoryVersion` int,
	`memorySourceMessageId` int,
	`eventDay` varchar(10),
	`memoryEpoch` int NOT NULL,
	`preferencesRevision` int NOT NULL,
	`notificationId` int NOT NULL,
	`status` enum('pending','delivering','sent','cancelled') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`leaseToken` varchar(36),
	`leaseUntil` timestamp(3),
	`nextRunAt` timestamp(3) NOT NULL DEFAULT (now()),
	`expiresAt` timestamp(3) NOT NULL,
	`createdAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `proactiveContacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_proactive_user_day` UNIQUE(`userId`,`localDay`)
);
--> statement-breakpoint
CREATE TABLE `proactiveDeliveries` (
	`id` varchar(36) NOT NULL,
	`contactId` varchar(36) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`subscriptionId` int NOT NULL,
	`deviceHash` varchar(64) NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`deliveredAt` timestamp(3),
	CONSTRAINT `proactiveDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_proactive_device` UNIQUE(`contactId`,`subscriptionId`,`deviceHash`)
);
--> statement-breakpoint
CREATE TABLE `pushSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`endpoint` varchar(500) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pushSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pushSubscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `rateWindows` (
	`userId` varchar(255) NOT NULL,
	`action` varchar(32) NOT NULL,
	`requests` json NOT NULL,
	`updatedAt` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `uniq_rate_user_action` UNIQUE(`userId`,`action`)
);
--> statement-breakpoint
CREATE TABLE `selfies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`girlfriendId` int NOT NULL,
	`messageId` int,
	`imageUrl` text NOT NULL,
	`imageKey` varchar(500) NOT NULL,
	`prompt` text NOT NULL,
	`userContext` text NOT NULL,
	`mode` enum('mirror','direct') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `selfies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(255) NOT NULL,
	`userId` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`ipAddress` varchar(64),
	`userAgent` text,
	`token` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'lemonsqueezy',
	`lsSubscriptionId` varchar(64) NOT NULL,
	`lsCustomerId` varchar(64),
	`providerUpdatedAt` timestamp(3),
	`pastDueSince` timestamp(3),
	`plan` enum('plus','pro') NOT NULL,
	`status` enum('on_trial','active','paused','past_due','unpaid','cancelled','expired') NOT NULL,
	`renewsAt` timestamp,
	`endsAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `subscriptions_lsSubscriptionId_unique` UNIQUE(`lsSubscriptionId`)
);
--> statement-breakpoint
CREATE TABLE `usageMeters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`period` varchar(10) NOT NULL,
	`meter` varchar(64) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `usageMeters_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_user_period_meter` UNIQUE(`userId`,`period`,`meter`)
);
--> statement-breakpoint
CREATE TABLE `userKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(255) NOT NULL,
	`name` varchar(64) NOT NULL,
	`encryptedValue` text NOT NULL,
	`lastFour` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_user_key_name` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `userPreferences` (
	`userId` varchar(255) NOT NULL,
	`language` varchar(35) NOT NULL DEFAULT 'system',
	`theme` enum('tokyo-sunset','sakura','midnight','neon-mint','crimson','sapphire','lava','pearl') NOT NULL DEFAULT 'tokyo-sunset',
	`colorMode` enum('system','light','dark') NOT NULL DEFAULT 'system',
	CONSTRAINT `userPreferences_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(255) NOT NULL,
	`name` text,
	`email` varchar(320) NOT NULL,
	`emailVerified` boolean NOT NULL DEFAULT false,
	`image` text,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`birthDate` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` varchar(255) NOT NULL,
	`identifier` varchar(320) NOT NULL,
	`value` varchar(255) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE INDEX `idx_ai_task_user_day` ON `aiTaskRuns` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_conversations_user_role` ON `conversations` (`userId`,`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_generation_turn_lease` ON `generationRequests` (`turnStatus`,`leaseUntil`);--> statement-breakpoint
CREATE INDEX `idx_generation_conversation` ON `generationRequests` (`conversationId`);--> statement-breakpoint
CREATE INDEX `idx_generation_expiry` ON `generationRequests` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_girlfriends_user_deleted` ON `girlfriends` (`userId`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `idx_media_cleanup_updated` ON `mediaDeletions` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_memory_job_next` ON `memoryExtractionJobs` (`status`,`nextRunAt`);--> statement-breakpoint
CREATE INDEX `idx_memory_job_role` ON `memoryExtractionJobs` (`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_id` ON `messages` (`conversationId`,`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_image_key` ON `messages` (`imageKey`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_role` ON `notifications` (`userId`,`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_proactive_next` ON `proactiveContacts` (`status`,`nextRunAt`);--> statement-breakpoint
CREATE INDEX `idx_rate_updated` ON `rateWindows` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_selfies_user_role` ON `selfies` (`userId`,`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_selfies_image_key` ON `selfies` (`imageKey`);--> statement-breakpoint
CREATE INDEX `idx_transcription_expiry` ON `voiceTranscriptions` (`expiresAt`);