ALTER TABLE `mediaDeletions` ADD `availableAt` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `mediaDeletions` ADD `deleting` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mediaDeletions` ADD `leaseUntil` timestamp;