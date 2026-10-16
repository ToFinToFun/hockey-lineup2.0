ALTER TABLE `activities` ADD `invitedPlayerIds` json;--> statement-breakpoint
ALTER TABLE `activities` ADD `feeEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `feeAmount` int;--> statement-breakpoint
ALTER TABLE `activities` ADD `feeReason` varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `feeSwish` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `activities` SET `invite` = 'all' WHERE `invite` NOT IN ('all','board','none');
