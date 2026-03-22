CREATE TABLE `app_secrets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`encryptedValue` text NOT NULL,
	`label` varchar(200),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_secrets_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_secrets_key_unique` UNIQUE(`key`)
);
