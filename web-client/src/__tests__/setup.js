import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// findBy*/waitFor default to 1 s. Under a full parallel run, lazily loaded studio
// chunks can take longer to appear, so wait up to 5 s before failing.
configure({ asyncUtilTimeout: 5000 });
