CREATE TABLE `app_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'lectura' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_idx` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`detail` text,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_events` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_events` (`at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`ruc` text,
	`kind` text DEFAULT 'clinica' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE TABLE `price_tiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`tier` text NOT NULL,
	`price_cents` integer NOT NULL,
	`valid_from` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `price_tiers_lookup_idx` ON `price_tiers` (`product_id`,`tier`,`valid_from`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`brand` text,
	`origin` text,
	`unit` text DEFAULT 'UNIDAD' NOT NULL,
	`cpc` text,
	`cudim` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_code_idx` ON `products` (`code`);--> statement-breakpoint
CREATE INDEX `products_cudim_idx` ON `products` (`cudim`);--> statement-breakpoint
CREATE TABLE `quote_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quote_id` integer NOT NULL,
	`product_id` integer,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost_cents` integer DEFAULT 0 NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`tier` text
);
--> statement-breakpoint
CREATE INDEX `quote_lines_quote_idx` ON `quote_lines` (`quote_id`);--> statement-breakpoint
CREATE INDEX `quote_lines_product_idx` ON `quote_lines` (`product_id`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`customer_id` integer,
	`status` text DEFAULT 'borrador' NOT NULL,
	`tax_rate_bps` integer DEFAULT 1500 NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_number_idx` ON `quotes` (`number`);--> statement-breakpoint
CREATE INDEX `quotes_customer_idx` ON `quotes` (`customer_id`);--> statement-breakpoint
CREATE TABLE `regulatory_document_products` (
	`document_id` integer NOT NULL,
	`product_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `regulatory_doc_product_idx` ON `regulatory_document_products` (`document_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `regulatory_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`covered_items` text DEFAULT '' NOT NULL,
	`issued_at` text,
	`expires_at` text,
	`file_ref` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `regulatory_code_idx` ON `regulatory_documents` (`code`);--> statement-breakpoint
CREATE INDEX `regulatory_expiry_idx` ON `regulatory_documents` (`expires_at`);--> statement-breakpoint
CREATE TABLE `requirement_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_text` text NOT NULL,
	`customer_key` text DEFAULT '' NOT NULL,
	`product_id` integer NOT NULL,
	`confirmed_by` integer NOT NULL,
	`confirmed_at` text NOT NULL,
	`times_used` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aliases_text_customer_idx` ON `requirement_aliases` (`normalized_text`,`customer_key`);--> statement-breakpoint
CREATE TABLE `supplier_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`unit_cost_cents` integer NOT NULL,
	`valid_from` text NOT NULL,
	`source` text
);
--> statement-breakpoint
CREATE INDEX `supplier_offers_product_idx` ON `supplier_offers` (`product_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact` text,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_name_idx` ON `suppliers` (`name`);--> statement-breakpoint
CREATE TABLE `tenders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`process_code` text NOT NULL,
	`entity` text NOT NULL,
	`cpc` text,
	`reference_budget_cents` integer,
	`closes_at` text,
	`outcome` text DEFAULT 'pendiente' NOT NULL,
	`offered_cents` integer,
	`awarded_cents` integer,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenders_code_idx` ON `tenders` (`process_code`);