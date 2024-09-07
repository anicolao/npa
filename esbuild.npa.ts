import { createContext } from "./esbuild.baseconfig";

const context = await createContext(true);
await context.watch();
context.dispose();
