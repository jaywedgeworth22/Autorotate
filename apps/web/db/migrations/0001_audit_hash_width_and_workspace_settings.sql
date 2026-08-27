CREATE TABLE `workspaceSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`alertsJson` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workspaceSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `auditLog` MODIFY COLUMN `prevHash` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `auditLog` MODIFY COLUMN `entryHash` varchar(64) NOT NULL;