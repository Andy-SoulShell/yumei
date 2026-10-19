CREATE INDEX `idx_conversations_user_role` ON `conversations` (`userId`,`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_generation_conversation` ON `generationRequests` (`conversationId`);--> statement-breakpoint
CREATE INDEX `idx_generation_expiry` ON `generationRequests` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_moods_user_role` ON `girlfriendMoods` (`userId`,`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_girlfriends_user_deleted` ON `girlfriends` (`userId`,`deletedAt`);--> statement-breakpoint
CREATE INDEX `idx_media_cleanup_updated` ON `mediaDeletions` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_id` ON `messages` (`conversationId`,`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_image_key` ON `messages` (`imageKey`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_created` ON `notifications` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_role` ON `notifications` (`userId`,`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_selfies_user_role` ON `selfies` (`userId`,`girlfriendId`);--> statement-breakpoint
CREATE INDEX `idx_selfies_image_key` ON `selfies` (`imageKey`);
--> statement-breakpoint
-- 以现有经验作为上线基线，避免对已经结算过的历史天数重复扣减。
UPDATE `girlfriends` SET `lastDecayAt` = CURRENT_TIMESTAMP WHERE `lastInteractionAt` IS NOT NULL AND `lastDecayAt` IS NULL;
--> statement-breakpoint
-- 旧订阅没有 Provider 版本时，以最后同步时间作为保守的乱序保护基线。
UPDATE `subscriptions` SET `providerUpdatedAt` = `updatedAt` WHERE `providerUpdatedAt` IS NULL;
--> statement-breakpoint
UPDATE `subscriptions` SET `pastDueSince` = `updatedAt` WHERE `status` = 'past_due' AND `pastDueSince` IS NULL;
