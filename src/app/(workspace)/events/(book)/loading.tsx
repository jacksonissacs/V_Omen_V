import { LoadingState } from "@/components/common/loading-state"

// Lives in the (book) group so it does not wrap events/[id]: a Suspense boundary there
// starts streaming before notFound() runs and turns the 404 into a 200.
export default function EventsLoading() {
  return <LoadingState />
}
