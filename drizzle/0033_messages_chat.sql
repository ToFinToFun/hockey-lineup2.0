CREATE TABLE `activity_chat` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`playerId` varchar(64),
	`text` varchar(1000) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_chat_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_chat_state` (
	`activityId` int NOT NULL,
	`memberId` int NOT NULL,
	`muted` boolean NOT NULL DEFAULT false,
	`lastReadId` int NOT NULL DEFAULT 0,
	CONSTRAINT `activity_chat_state_uniq` UNIQUE(`activityId`,`memberId`)
);
--> statement-breakpoint
CREATE TABLE `member_message_reads` (
	`messageId` int NOT NULL,
	`memberId` int NOT NULL,
	`readAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `member_message_reads_uniq` UNIQUE(`messageId`,`memberId`)
);
--> statement-breakpoint
CREATE TABLE `member_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`audienceLabel` varchar(200) NOT NULL,
	`activityId` int,
	`recipientMemberIds` json NOT NULL,
	`emailed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `member_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `member_prefs` (
	`memberId` int NOT NULL,
	`invitesEmail` boolean NOT NULL DEFAULT true,
	`remindersEmail` boolean NOT NULL DEFAULT true,
	`messagesEmail` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `member_prefs_memberId` PRIMARY KEY(`memberId`)
);
--> statement-breakpoint
CREATE INDEX `activity_chat_activity_idx` ON `activity_chat` (`activityId`,`id`);--> statement-breakpoint
CREATE INDEX `member_messages_created_idx` ON `member_messages` (`createdAt`);