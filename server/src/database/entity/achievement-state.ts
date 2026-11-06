import { Column, Entity, PrimaryColumn } from "typeorm";

import type { GameSummary, NormalizedGame } from "../../sync/achievement";

@Entity()
export class AchievementSourceState {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "timestamptz" })
  started_at!: Date;

  @Column({ type: "timestamptz", nullable: true })
  finished_at!: Date | null;

  @Column({ type: "text" })
  result!: "running" | "success" | "failure";

  @Column({ type: "timestamptz", nullable: true })
  successful_at!: Date | null;

  @Column({ type: "text", nullable: true })
  rotation_cursor!: string | null;
}

@Entity()
export class AchievementGameSnapshot {
  @PrimaryColumn({ type: "text" })
  source_id!: string;

  @PrimaryColumn({ type: "text" })
  game_id!: string;

  @Column({ type: "json" })
  summary!: GameSummary;

  @Column({ type: "json" })
  game!: NormalizedGame;

  @Column({ type: "text" })
  definition_fingerprint!: string;

  @Column({ type: "timestamptz" })
  checked_at!: Date;
}
