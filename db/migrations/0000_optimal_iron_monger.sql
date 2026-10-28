CREATE TABLE `academic_activities` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name_cn` varchar(255) NOT NULL,
	`name_en` varchar(255),
	`start_date` varchar(10),
	`end_date` varchar(10),
	`location` varchar(255),
	`url` varchar(512),
	`submit_deadline` varchar(10),
	`reg_deadline` varchar(10),
	`attendee_ids` json NOT NULL,
	`abstracts` text,
	`submission_record` text,
	`reports` json NOT NULL,
	`created_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `academic_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `achievements` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`category` enum('published_paper','patent','award','student_work','book','software_copyright') NOT NULL,
	`title` varchar(512) NOT NULL,
	`authors` varchar(512),
	`year` int NOT NULL,
	`date` varchar(10),
	`detail` json NOT NULL,
	`evidence_file_ids` json NOT NULL,
	`is_public` boolean NOT NULL DEFAULT false,
	`from_student_name` varchar(64),
	`created_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `achievements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `advisor_map` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`mentor_id` bigint unsigned NOT NULL,
	`ord` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `advisor_map_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_tasks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`module` varchar(64) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_id` bigint unsigned,
	`suggested` json NOT NULL,
	`status` enum('pending','confirmed','rejected') NOT NULL DEFAULT 'pending',
	`created_by` bigint unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned,
	`user_name` varchar(64),
	`action` varchar(64) NOT NULL,
	`module` varchar(64) NOT NULL,
	`detail` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collaborations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`partner` varchar(128) NOT NULL,
	`partner_org` varchar(255),
	`division` text,
	`outputs` text,
	`status` enum('ongoing','done','paused') NOT NULL DEFAULT 'ongoing',
	`start_date` varchar(10),
	`owner_id` bigint unsigned,
	`participant_ids` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collaborations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_feedback` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`module` varchar(64) NOT NULL,
	`record_id` bigint unsigned,
	`record_title` varchar(512),
	`content` text NOT NULL,
	`status` enum('pending','resolved') NOT NULL DEFAULT 'pending',
	`created_by` bigint unsigned NOT NULL,
	`created_by_name` varchar(64),
	`resolved_by` bigint unsigned,
	`resolved_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `data_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_bookings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`device_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`user_name` varchar(64),
	`start_time` varchar(16) NOT NULL,
	`end_time` varchar(16) NOT NULL,
	`purpose` varchar(255),
	`status` enum('pending','approved','rejected','done','cancelled') NOT NULL DEFAULT 'pending',
	`reviewed_by` bigint unsigned,
	`reviewed_by_name` varchar(64),
	`review_note` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `device_bookings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `device_maintenance` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`device_id` bigint unsigned NOT NULL,
	`type` enum('routine','repair','calibration') NOT NULL DEFAULT 'routine',
	`date` varchar(10) NOT NULL,
	`cost` int NOT NULL DEFAULT 0,
	`operator` varchar(64),
	`note` text,
	`file_ids` json NOT NULL,
	`created_by` bigint unsigned,
	`created_by_name` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `device_maintenance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`model` varchar(128),
	`asset_no` varchar(64),
	`vendor` varchar(128),
	`purchase_date` varchar(10),
	`price` int NOT NULL DEFAULT 0,
	`project_id` bigint unsigned,
	`location` varchar(128),
	`keeper_id` bigint unsigned,
	`keeper_name` varchar(64),
	`status` enum('in_use','maintenance','idle','scrapped') NOT NULL DEFAULT 'in_use',
	`shared` boolean NOT NULL DEFAULT true,
	`note` text,
	`file_ids` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doc_shares` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`student_name` varchar(64),
	`task_id` bigint unsigned,
	`type` enum('weekly','paper_draft','ppt_draft','report','other') NOT NULL DEFAULT 'weekly',
	`title` varchar(255) NOT NULL,
	`content` text,
	`file_ids` json NOT NULL,
	`to_user_ids` json NOT NULL,
	`status` enum('submitted','feedback') NOT NULL DEFAULT 'submitted',
	`feedback` text,
	`feedback_file_ids` json,
	`feedback_by` bigint unsigned,
	`feedback_by_name` varchar(64),
	`feedback_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `doc_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expert_visits` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`expert_name` varchar(64) NOT NULL,
	`expert_org` varchar(255),
	`expert_title` varchar(128),
	`report_title` varchar(512) NOT NULL,
	`abstract` text,
	`report_time` varchar(32),
	`location` varchar(255),
	`reception` text,
	`host_id` bigint unsigned NOT NULL,
	`photo_file_ids` json NOT NULL,
	`poster_content` text,
	`news_draft` text,
	`expert_bio` text,
	`is_public` boolean NOT NULL DEFAULT false,
	`status` enum('planned','held','archived') NOT NULL DEFAULT 'planned',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expert_visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_configs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`key` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`config` json NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`updated_by` bigint unsigned,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `external_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_configs_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `file_chunks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`file_id` bigint unsigned NOT NULL,
	`seq` int NOT NULL,
	`data` longtext NOT NULL,
	CONSTRAINT `file_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`mime` varchar(128),
	`size` int NOT NULL DEFAULT 0,
	`data_base64` longtext,
	`storage_key` varchar(512),
	`shared_with_ids` json,
	`module` varchar(64),
	`visibility` enum('private','admins','no_guest','all') NOT NULL DEFAULT 'no_guest',
	`review_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
	`review_note` varchar(255),
	`uploaded_by` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fund_cards` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`project_id` bigint unsigned,
	`project_code` varchar(64),
	`project_name` varchar(255) NOT NULL,
	`source` varchar(128),
	`total_amount` int NOT NULL DEFAULT 0,
	`budgets` json NOT NULL,
	`arrivals` json NOT NULL,
	`expenses` json NOT NULL,
	`labor_payments` json NOT NULL,
	`transfers` json NOT NULL,
	`owner_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fund_cards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ip_applications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`ip_type` enum('发明专利','GF专利','实用新型','软件著作权') NOT NULL,
	`agency` varchar(255) NOT NULL,
	`application_no` varchar(128),
	`status` enum('writing','external_review','revision','new_external_review','accepted','granted') NOT NULL DEFAULT 'writing',
	`owner_id` bigint unsigned NOT NULL,
	`participant_ids` json NOT NULL,
	`submit_date` varchar(10),
	`protection_end` varchar(10),
	`note` text,
	`file_ids` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ip_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mentoring_posts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`user_name` varchar(64) NOT NULL,
	`topics` varchar(512) NOT NULL,
	`skills` varchar(512) NOT NULL,
	`research` text,
	`contact` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mentoring_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paper_rounds` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`paper_id` bigint unsigned NOT NULL,
	`round` int NOT NULL DEFAULT 1,
	`venue` varchar(255) NOT NULL,
	`submitted_at` varchar(10) NOT NULL,
	`status` enum('submitted','under_review','revision','rejected','accepted') NOT NULL DEFAULT 'submitted',
	`decision_at` varchar(10),
	`decision_note` text,
	`file_ids` json NOT NULL,
	`created_by` bigint unsigned NOT NULL,
	`created_by_name` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paper_rounds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`authors` varchar(512),
	`journal` varchar(255),
	`target_tier` varchar(64),
	`status` enum('writing','submitted','under_review','revision','accepted','online','indexed','rejected') NOT NULL DEFAULT 'writing',
	`submit_date` varchar(10),
	`doi` varchar(128),
	`file_id` bigint unsigned,
	`leader_id` bigint unsigned NOT NULL,
	`participant_ids` json NOT NULL,
	`note` text,
	`achievement_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `papers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `point_docs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`point_id` bigint unsigned NOT NULL,
	`file_id` bigint unsigned NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`note` varchar(255),
	`uploaded_by` bigint unsigned NOT NULL,
	`uploaded_by_name` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `point_docs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_outputs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`project_id` bigint unsigned NOT NULL,
	`output_type` enum('paper','achievement') NOT NULL,
	`output_id` bigint unsigned NOT NULL,
	`ord` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_outputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(64),
	`category` enum('vertical','horizontal') NOT NULL DEFAULT 'vertical',
	`source` varchar(128),
	`leader` varchar(64),
	`leader_id` bigint unsigned,
	`participant_ids` json,
	`start_date` varchar(10),
	`end_date` varchar(10),
	`total_budget` int NOT NULL DEFAULT 0,
	`received_amount` int NOT NULL DEFAULT 0,
	`status` enum('preparing','ongoing','concluding','concluded') NOT NULL DEFAULT 'ongoing',
	`description` text,
	`milestones` json NOT NULL,
	`contract_file_ids` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quick_links` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`title` varchar(120) NOT NULL,
	`url` varchar(500) NOT NULL,
	`ord` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quick_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ref_directions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`parent_id` bigint unsigned,
	`name` varchar(128) NOT NULL,
	`description` varchar(255),
	`created_by` bigint unsigned,
	`created_by_name` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ref_directions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reference_pushes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`reference_id` bigint unsigned NOT NULL,
	`to_user_id` bigint unsigned NOT NULL,
	`message` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reference_pushes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `references` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`direction_id` bigint unsigned,
	`authors` varchar(512) NOT NULL,
	`year` int,
	`title` varchar(512) NOT NULL,
	`reference_type` enum('article','book') NOT NULL DEFAULT 'article',
	`venue` varchar(255),
	`publisher` varchar(255),
	`isbn` varchar(64),
	`volume` varchar(64),
	`pages` varchar(64),
	`doi` varchar(128),
	`abstract` text,
	`keywords` varchar(512),
	`category` varchar(128),
	`tags` varchar(512),
	`importance` int NOT NULL DEFAULT 3,
	`notes` text,
	`file_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `references_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `research_points` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`task_id` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`summary` text,
	`created_by` bigint unsigned NOT NULL,
	`created_by_name` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `research_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `research_tasks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`title` varchar(255) NOT NULL,
	`direction` varchar(255),
	`question` text,
	`goal` text,
	`approach` text,
	`expected_output` varchar(255),
	`start_date` varchar(10),
	`end_date` varchar(10),
	`status` enum('active','paused','done') NOT NULL DEFAULT 'active',
	`created_by` bigint unsigned NOT NULL,
	`created_by_name` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `research_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(512) NOT NULL,
	`authors` varchar(512),
	`direction` varchar(255),
	`keywords` varchar(512),
	`journal` varchar(255),
	`file_id` bigint unsigned,
	`status` enum('pending','assigned','in_review','done') NOT NULL DEFAULT 'pending',
	`assignments` json NOT NULL,
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`role` varchar(32) NOT NULL,
	`perm_key` varchar(64) NOT NULL,
	`level` enum('hidden','readonly','editable','manage') NOT NULL DEFAULT 'readonly',
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `social_services` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`type` enum('parttime','academic_org','conference_host','review','advisory','popularization') NOT NULL,
	`org_name` varchar(255) NOT NULL,
	`position` varchar(128),
	`start_date` varchar(10),
	`end_date` varchar(10),
	`deadline` varchar(10),
	`confidential` boolean NOT NULL DEFAULT false,
	`detail` json NOT NULL,
	`attachment_file_ids` json NOT NULL,
	`is_public` boolean NOT NULL DEFAULT false,
	`owner_id` bigint unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `social_services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_achievements` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`type` enum('paper','patent','competition','conference_award') NOT NULL,
	`title` varchar(512) NOT NULL,
	`detail` text,
	`date` varchar(10),
	`status` enum('pending','confirmed') NOT NULL DEFAULT 'pending',
	`achievement_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `student_achievements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_progress` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`topic` varchar(255) NOT NULL,
	`stage_goal` text,
	`proposal_status` enum('not_started','ongoing','done') NOT NULL DEFAULT 'not_started',
	`midterm_status` enum('not_started','ongoing','done') NOT NULL DEFAULT 'not_started',
	`defense_status` enum('not_started','ongoing','done') NOT NULL DEFAULT 'not_started',
	`reports` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `student_progress_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`kind` enum('grad','undergrad','postdoc') NOT NULL DEFAULT 'grad',
	`name` varchar(64) NOT NULL,
	`student_no` varchar(64),
	`gender` varchar(8),
	`phone` varchar(32),
	`wechat` varchar(64),
	`email` varchar(128),
	`hometown` varchar(128),
	`bachelor_school` varchar(255),
	`advisor` varchar(64),
	`direction` varchar(255),
	`proposal_status` varchar(32) DEFAULT '未开始',
	`midterm_status` varchar(32) DEFAULT '未开始',
	`defense_status` varchar(32) DEFAULT '未开始',
	`files` json NOT NULL,
	`detail` json,
	`user_id` bigint unsigned,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`due_date` varchar(10),
	`status` enum('pending','done') NOT NULL DEFAULT 'pending',
	`pinned` boolean NOT NULL DEFAULT false,
	`creator_id` bigint unsigned NOT NULL,
	`creator_name` varchar(64),
	`leader_ids` json NOT NULL,
	`participant_ids` json NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'manual',
	`source_ref_id` bigint unsigned,
	`link` varchar(255),
	`category` varchar(64),
	`attachment_file_ids` json,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `todos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_nodes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`node_type` enum('入学','开题','中期','预答辩','答辩','毕业') NOT NULL,
	`date` varchar(10),
	`status` enum('pending','done') NOT NULL DEFAULT 'pending',
	`note` varchar(512),
	`file_ids` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `training_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(64) NOT NULL,
	`role` enum('super_admin','teacher','postdoc','grad','benyan','intern','guest') NOT NULL DEFAULT 'grad',
	`is_admin` boolean NOT NULL DEFAULT false,
	`title` varchar(64),
	`email` varchar(128),
	`phone` varchar(32),
	`research_direction` varchar(255),
	`orcid` varchar(64),
	`homepage` varchar(255),
	`id_card` varchar(32),
	`main_campus` varchar(64),
	`campus` varchar(64),
	`building` varchar(64),
	`room` varchar(64),
	`enroll_year` int,
	`expected_grad_year` int,
	`must_change_password` boolean NOT NULL DEFAULT true,
	`must_complete_profile` boolean NOT NULL DEFAULT true,
	`gender` varchar(10),
	`birth_date` varchar(10),
	`staff_no` varchar(50),
	`degree` varchar(50),
	`alma_mater` varchar(200),
	`political_status` varchar(50),
	`join_date` varchar(10),
	`active` boolean NOT NULL DEFAULT true,
	`restricted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `website_updates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`type` varchar(32) NOT NULL,
	`title` varchar(512) NOT NULL,
	`payload` json NOT NULL,
	`source` varchar(64),
	`status` enum('pending','pushed','discarded') NOT NULL DEFAULT 'pending',
	`created_by` bigint unsigned,
	`created_by_name` varchar(64),
	`pushed_by` bigint unsigned,
	`pushed_by_name` varchar(64),
	`pushed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `website_updates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_reports` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`student_id` bigint unsigned NOT NULL,
	`student_name` varchar(64),
	`week_start` varchar(10) NOT NULL,
	`content` text NOT NULL,
	`plan` text,
	`problems` text,
	`file_ids` json NOT NULL,
	`status` enum('submitted','reviewed') NOT NULL DEFAULT 'submitted',
	`student_reply` text,
	`student_reply_at` timestamp,
	`feedback` text,
	`feedback_file_ids` json,
	`feedback_by` bigint unsigned,
	`feedback_by_name` varchar(64),
	`feedback_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weekly_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wos_citations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`achievement_id` bigint unsigned NOT NULL,
	`counts` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wos_citations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_file_chunks_file` ON `file_chunks` (`file_id`);