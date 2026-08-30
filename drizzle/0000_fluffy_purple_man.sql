CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attachments_object_key` ON `attachments` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_attachments_entity` ON `attachments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`district_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`field_name` text,
	`old_value` text,
	`new_value` text,
	`reason` text,
	`source` text NOT NULL,
	`actor_role` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_district_created` ON `audit_logs` (`district_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_entity` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `collection_events` (
	`id` text PRIMARY KEY NOT NULL,
	`receivable_id` text NOT NULL,
	`action_type` text NOT NULL,
	`action_date` text NOT NULL,
	`note` text,
	`attachment_id` text,
	`status` text DEFAULT 'VALID' NOT NULL,
	`void_reason` text,
	`correction_of_id` text,
	`created_by` text NOT NULL,
	`created_by_name` text NOT NULL,
	`created_at` text NOT NULL,
	`voided_by` text,
	`voided_at` text,
	FOREIGN KEY (`receivable_id`) REFERENCES `receivables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_collections_receivable_status_date` ON `collection_events` (`receivable_id`,`status`,`action_date`);--> statement-breakpoint
CREATE INDEX `idx_collections_correction` ON `collection_events` (`correction_of_id`);--> statement-breakpoint
CREATE TABLE `demo_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`district_id` text,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_demo_sessions_district` ON `demo_sessions` (`district_id`);--> statement-breakpoint
CREATE TABLE `districts` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_districts_code` ON `districts` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_districts_name` ON `districts` (`name`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`file_name` text NOT NULL,
	`total_rows` integer NOT NULL,
	`valid_rows` integer NOT NULL,
	`invalid_rows` integer NOT NULL,
	`committed_rows` integer DEFAULT 0 NOT NULL,
	`district_id` text,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`committed_at` text,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_import_batches_district_created` ON `import_batches` (`district_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`project_code` text NOT NULL,
	`name` text NOT NULL,
	`contract_code` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`district_id` text NOT NULL,
	`org_level4` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_type` text NOT NULL,
	`customer_contact` text NOT NULL,
	`delivery_owner` text NOT NULL,
	`account_manager` text NOT NULL,
	`delivery_manager` text NOT NULL,
	`status` text NOT NULL,
	`contract_date` text NOT NULL,
	`contract_amount_cents` integer NOT NULL,
	`amount_composition` text NOT NULL,
	`billing_code` text,
	`archived_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`district_id`) REFERENCES `districts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_project_code` ON `projects` (`project_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_contract_code` ON `projects` (`contract_code`);--> statement-breakpoint
CREATE INDEX `idx_projects_district_archived` ON `projects` (`district_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`receivable_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`received_date` text NOT NULL,
	`note` text,
	`attachment_id` text,
	`status` text DEFAULT 'VALID' NOT NULL,
	`void_reason` text,
	`correction_of_id` text,
	`created_by` text NOT NULL,
	`created_by_name` text NOT NULL,
	`created_at` text NOT NULL,
	`voided_by` text,
	`voided_at` text,
	FOREIGN KEY (`receivable_id`) REFERENCES `receivables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_receipts_receivable_status` ON `receipts` (`receivable_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_receipts_correction` ON `receipts` (`correction_of_id`);--> statement-breakpoint
CREATE TABLE `receivables` (
	`id` text PRIMARY KEY NOT NULL,
	`receivable_code` text NOT NULL,
	`project_id` text NOT NULL,
	`sequence_no` integer NOT NULL,
	`payment_type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payment_condition` text NOT NULL,
	`baseline_event` text NOT NULL,
	`baseline_date` text NOT NULL,
	`term_days` integer NOT NULL,
	`due_date` text NOT NULL,
	`acceptance_type` text,
	`acceptance_date` text,
	`invoice_status` text,
	`invoice_delivered_date` text,
	`overdue_reason` text,
	`confirmation_status` text DEFAULT 'DRAFT' NOT NULL,
	`writeoff_status` text DEFAULT 'UNPAID' NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receivables_code` ON `receivables` (`receivable_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receivables_project_sequence` ON `receivables` (`project_id`,`sequence_no`);--> statement-breakpoint
CREATE INDEX `idx_receivables_project_status` ON `receivables` (`project_id`,`confirmation_status`,`writeoff_status`);--> statement-breakpoint
CREATE TABLE `risk_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`blue_min_days` integer NOT NULL,
	`yellow_min_days` integer NOT NULL,
	`red_min_days` integer NOT NULL,
	`legal_level5_min_months` integer NOT NULL,
	`legal_level4_min_months` integer NOT NULL,
	`legal_level3_min_months` integer NOT NULL,
	`legal_level2_min_months` integer NOT NULL,
	`legal_level1_min_months` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
