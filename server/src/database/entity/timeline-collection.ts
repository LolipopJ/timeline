import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";

import TimelineItem from "./timeline-item";

@Entity()
export class TimelineCollection {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column("text")
  name!: string;

  @Index()
  @ForeignKey(() => TimelineCollection)
  @Column("uuid", { nullable: true })
  parent_id!: string | null;
}

@Entity()
export class TimelineItemCollection {
  @ForeignKey(() => TimelineItem, { onDelete: "CASCADE" })
  @PrimaryColumn("uuid")
  timeline_item_id!: string;

  @Index()
  @ForeignKey(() => TimelineCollection, { onDelete: "CASCADE" })
  @PrimaryColumn("uuid")
  collection_id!: string;
}
