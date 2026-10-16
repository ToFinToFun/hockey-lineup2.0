CREATE TABLE `activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seriesId` varchar(36),
	`type` varchar(16) NOT NULL,
	`title` varchar(120) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp,
	`location` varchar(120) NOT NULL DEFAULT '',
	`description` text,
	`invite` varchar(16) NOT NULL DEFAULT 'all',
	`maxParticipants` int,
	`waitlist` boolean NOT NULL DEFAULT false,
	`opensDaysBefore` int,
	`closesHoursBefore` int,
	`cancelled` boolean NOT NULL DEFAULT false,
	`cancelledNote` varchar(200) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`playerId` varchar(64) NOT NULL,
	`status` varchar(10) NOT NULL,
	`source` varchar(10) NOT NULL DEFAULT 'admin',
	`comment` varchar(200) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `activity_attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_attendance_uniq` UNIQUE(`activityId`,`playerId`)
);
--> statement-breakpoint
CREATE INDEX `activities_starts_idx` ON `activities` (`startsAt`);--> statement-breakpoint
CREATE INDEX `activities_series_idx` ON `activities` (`seriesId`);