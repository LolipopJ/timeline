import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from "typeorm";

import { SyncServiceType } from "../../../../enums";
import type { TimelineItemAttachment } from "../../../../interfaces";

@Entity()
@Unique("unique_service_content", ["sync_service_id", "content_id"])
export class TimelineItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", nullable: true })
  parent_id?: string;

  @Column({ type: "simple-array", nullable: true })
  children?: string[];

  @PrimaryColumn({ type: "text" })
  sync_service_id!: string;

  @Column({ type: "enum", enum: SyncServiceType })
  sync_service_type!: SyncServiceType;

  @PrimaryColumn({ type: "text" })
  content_id!: string;

  @Column({ type: "text", nullable: true })
  title?: string;

  @Column({ type: "text", nullable: true })
  content?: string;

  @Column({ type: "text", nullable: true })
  url?: string;

  @Column({ type: "json", nullable: true })
  attachments?: TimelineItemAttachment[];

  @Column({ type: "text", nullable: true })
  metadata?: string;

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
