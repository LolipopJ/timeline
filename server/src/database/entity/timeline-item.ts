import { SyncServiceType } from "@timeline/contracts";
import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from "typeorm";

import type { TimelineItemAttachment } from "../../types/config";

@Entity()
@Unique("unique_service_content", ["sync_service_id", "content_id"])
export class TimelineItem {
  @PrimaryGeneratedColumn("uuid")
  id?: string;

  @Column({ type: "uuid", nullable: true })
  parent_id?: string;

  @Column({ type: "simple-array", nullable: true })
  children?: string[];

  @Column({ type: "text" })
  sync_service_id!: string;

  @Column({ type: "enum", enum: SyncServiceType })
  sync_service_type!: SyncServiceType;

  @Column({ type: "text" })
  content_id!: string;

  @Column({ type: "text", nullable: true })
  title?: string | null;

  @Column({ type: "text", nullable: true })
  content?: string | null;

  @Column({ type: "text", nullable: true })
  url?: string | null;

  @Column({ type: "json", nullable: true })
  attachments?: TimelineItemAttachment[] | null;

  @Column({ type: "text", nullable: true })
  metadata?: string;

  @Column({ type: "boolean", nullable: true, default: false })
  is_secret?: boolean | null;

  @VersionColumn()
  version?: number;

  @Column({ type: "timestamptz" })
  created_at!: Date;

  @Column({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}

export default TimelineItem;
