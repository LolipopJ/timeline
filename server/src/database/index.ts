import { DataSource } from "typeorm";

import config from "../../../configs/server";
import TimelineItem from "./entity/timeline-item";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: config.database.host,
  port: config.database.port,
  username: config.database.user,
  password: config.database.password,
  database:
    config.database.database +
    (process.env.NODE_ENV === "development" ? "_dev" : ""),
  entities: [TimelineItem],
  synchronize: true,
  logging: false,
});

export default AppDataSource;
