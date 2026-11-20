import type { CollectionTreeDto, TimelineView } from "@timeline/contracts";
import { useContext } from "react";
import useSWR from "swr";

import GlobalContext from "@/contexts/GlobalContext";
import { fetcherGET } from "@/services/axios";

export const timelineCollectionsKey = (view: TimelineView) =>
  "/timeline-collections?view=" + view;

export default function useTimelineCollections() {
  const { view } = useContext(GlobalContext);
  return useSWR<CollectionTreeDto>(timelineCollectionsKey(view), fetcherGET);
}
