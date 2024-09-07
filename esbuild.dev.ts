import { createContext } from "./esbuild.baseconfig";

const context = await createContext();
context.watch();
