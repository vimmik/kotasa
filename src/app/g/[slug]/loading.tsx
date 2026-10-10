import { Loading } from "@/components/bits";

// Suspense boundary for client navigations below this segment's layout:
// the layout's own <Suspense> doesn't re-render on those, so pages need this one.
export default function SegmentLoading() {
  return <Loading />;
}
