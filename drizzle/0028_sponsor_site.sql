ALTER TABLE `sponsors` ADD `siteId` int;--> statement-breakpoint
ALTER TABLE `sponsors` ADD `logoVersion` varchar(32);--> statement-breakpoint
ALTER TABLE `sponsors` ADD CONSTRAINT `sponsors_siteId_unique` UNIQUE(`siteId`);