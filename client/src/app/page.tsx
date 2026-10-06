import { Suspense } from "react";

import TimelineHome from "@/components/TimelineHome";

export default function Page() {
  return (
    <Suspense fallback={<div role="status">Loading...</div>}>
      <TimelineHome />
    </Suspense>
  );
}
