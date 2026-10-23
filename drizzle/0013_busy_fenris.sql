ALTER TABLE `conversations` ADD `branchRequestId` varchar(36);--> statement-breakpoint
ALTER TABLE `conversations` ADD `branchSourceId` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `branchMessageId` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `branchInput` text;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `idx_conversation_branch_request` UNIQUE(`userId`,`branchRequestId`);