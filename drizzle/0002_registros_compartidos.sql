CREATE TABLE `shared_records` (
	`collection` text NOT NULL,
	`record_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`updated_by` text,
	PRIMARY KEY(`collection`, `record_id`)
);
--> statement-breakpoint
CREATE INDEX `shared_records_updated_idx` ON `shared_records` (`collection`,`updated_at`);