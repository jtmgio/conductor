import { Suspense } from "react";
import { FocusPage } from "./FocusPage";

// The dispatch board reads its filters with useSearchParams, which needs a boundary to build.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <FocusPage />
    </Suspense>
  );
}
