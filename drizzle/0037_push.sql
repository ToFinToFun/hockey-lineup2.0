CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`endpoint` varchar(700) NOT NULL,
	`p256dh` varchar(200) NOT NULL,
	`auth` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastOkAt` timestamp,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_endpoint_uniq` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE INDEX `push_member_idx` ON `push_subscriptions` (`memberId`);