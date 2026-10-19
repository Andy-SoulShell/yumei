ALTER TABLE `mediaDeletions` MODIFY COLUMN `availableAt` timestamp(3) NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `mediaDeletions` MODIFY COLUMN `leaseUntil` timestamp(3);