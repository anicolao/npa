import { createContext } from "./esbuild.baseconfig";

const context = await createContext(true);
try {
  await context.rebuild();
} finally {
  await context.dispose();
}
