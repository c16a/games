import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const outputDirectory = resolve(repositoryRoot, "dist");
const metadataDirectory = resolve(repositoryRoot, ".build");
const packageManifest = await Bun.file(join(repositoryRoot, "package.json")).json() as { name?: string };

if (packageManifest.name !== "games") {
  throw new Error("Refusing to clean output outside the Happy Arcade repository");
}
if (dirname(outputDirectory) !== repositoryRoot || basename(outputDirectory) !== "dist") {
  throw new Error(`Refusing to clean unexpected output path: ${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(metadataDirectory, { recursive: true });
