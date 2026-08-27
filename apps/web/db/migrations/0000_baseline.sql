CREATE TABLE `auditLog` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`ts` timestamp(3) NOT NULL,
	`actor` varchar(128) NOT NULL,
	`action` varchar(128) NOT NULL,
	`secretId` bigint unsigned,
	`detailJson` json,
	`prevHash` varchar(16) NOT NULL,
	`entryHash` varchar(16) NOT NULL,
	CONSTRAINT `auditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`platform` varchar(64) NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`capability` enum('programmatic','partial','update_only') NOT NULL,
	`configEnc` text,
	`status` enum('connected','error','disconnected') NOT NULL DEFAULT 'disconnected',
	`lastCheckedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `connectors_id` PRIMARY KEY(`id`),
	CONSTRAINT `connectors_platform_unique` UNIQUE(`platform`)
);
--> statement-breakpoint
CREATE TABLE `rotationRuns` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`secretId` bigint unsigned NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`status` enum('running','committed','partial','failed') NOT NULL DEFAULT 'running',
	`trigger` enum('manual','scheduled','retry') NOT NULL,
	`stepsJson` json,
	`newFingerprint` varchar(16),
	`error` text,
	CONSTRAINT `rotationRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`connectorId` bigint unsigned NOT NULL,
	`environment` varchar(64) NOT NULL DEFAULT 'production',
	`status` enum('healthy','due_soon','overdue','paused','rotating','failed') NOT NULL DEFAULT 'healthy',
	`policyJson` json,
	`lastRotatedAt` timestamp,
	`nextDueAt` timestamp,
	`version` int NOT NULL DEFAULT 1,
	`fingerprint` varchar(16),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `secrets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`secretId` bigint unsigned NOT NULL,
	`kind` enum('infisical','file','webhook','keychain') NOT NULL,
	`configJson` json,
	`enabled` boolean NOT NULL DEFAULT true,
	`lastDeliveredAt` timestamp,
	`lastStatus` enum('ok','failed','pending') NOT NULL DEFAULT 'pending',
	CONSTRAINT `targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `rotationRuns` ADD CONSTRAINT `rotationRuns_secretId_secrets_id_fk` FOREIGN KEY (`secretId`) REFERENCES `secrets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `secrets` ADD CONSTRAINT `secrets_connectorId_connectors_id_fk` FOREIGN KEY (`connectorId`) REFERENCES `connectors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `targets` ADD CONSTRAINT `targets_secretId_secrets_id_fk` FOREIGN KEY (`secretId`) REFERENCES `secrets`(`id`) ON DELETE no action ON UPDATE no action;