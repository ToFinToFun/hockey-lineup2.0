CREATE TABLE `media_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(20) NOT NULL,
	`title` varchar(120) NOT NULL,
	`settings` json NOT NULL,
	`caption` text,
	`photo` mediumtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `media_posts_id` PRIMARY KEY(`id`)
);
