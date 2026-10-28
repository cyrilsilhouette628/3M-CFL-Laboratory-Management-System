ALTER TABLE `collaborations` MODIFY COLUMN `participant_ids` json;--> statement-breakpoint
ALTER TABLE `files` MODIFY COLUMN `shared_with_ids` json;--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `participant_ids` json;