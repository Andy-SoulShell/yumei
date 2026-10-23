ALTER TABLE `coinLedger` ADD `sequence` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `coinWallets` ADD `sequence` int DEFAULT 0 NOT NULL;