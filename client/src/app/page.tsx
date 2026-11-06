import { Suspense } from "react";

import TimelineArchive, {
  TimelineArchiveLoading,
} from "@/components/TimelineArchive";
import TimelineHome from "@/components/TimelineHome";

export default function Page() {
  return (
    <Suspense
      fallback={
        <TimelineArchive>
          <TimelineArchiveLoading label="正在加载筛选来源" />
        </TimelineArchive>
      }
    >
      <TimelineHome />
    </Suspense>
  );
}
