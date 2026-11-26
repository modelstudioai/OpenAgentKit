import { Check, Column, Entity, Index } from "typeorm";

@Entity("kit_sessions")
@Index("idx_debug_sessions_project", ["purpose", "subject_id", "project_name", "agent_key", "created_at"])
@Index("idx_sessions_subject", ["purpose", "subject_id", "created_at"])
@Check("purpose IN ('experience', 'admin_debug')")
@Check("debug_source IN ('project', 'template')")
@Check(
	"(purpose = 'experience' AND agent_slug IS NOT NULL AND debug_source IS NULL)\n    OR (purpose = 'admin_debug' AND agent_slug IS NULL AND remote_agent_id IS NOT NULL AND debug_source IS NOT NULL AND\n      ((debug_source = 'project' AND project_name IS NOT NULL AND agent_key IS NOT NULL)\n        OR (debug_source = 'template' AND project_name IS NULL AND agent_key IS NULL)))",
)
export class KitSessionsEntity {
	@Column({ type: "text", primary: true, nullable: true })
	declare session_id: string | null;

	@Column("text")
	declare subject_id: string;

	@Column("text", { default: "experience" })
	declare purpose: string;

	@Column("text", { nullable: true })
	declare agent_slug: string | null;

	@Column("text", { nullable: true })
	declare remote_agent_id: string | null;

	@Column("text", { nullable: true })
	declare project_name: string | null;

	@Column("text", { nullable: true })
	declare agent_key: string | null;

	@Column("text", { nullable: true })
	declare project_revision: string | null;

	@Column("integer", { nullable: true })
	declare source_dirty: number | null;

	@Column("text", { nullable: true })
	declare title: string | null;

	@Column("text", { nullable: true })
	declare status: string | null;

	@Column("text")
	declare created_at: string;

	@Column("text", { nullable: true })
	declare last_event_at: string | null;

	@Column("text", { nullable: true })
	declare files_json: string | null;

	@Column("text", { nullable: true })
	declare debug_source: string | null;

	@Column("text", { nullable: true })
	declare remote_environment_id: string | null;

	@Column("text", { nullable: true })
	declare runtime_json: string | null;

	@Column("text", { nullable: true })
	declare message_files_json: string | null;
}
