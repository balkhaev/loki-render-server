import express from "express";
import multer from "multer";
import decompress from "decompress";
import path from "path";
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "fs";
import archiver from "archiver";
import fs from "node:fs/promises";
import { fileURLToPath } from "url";

const app = express();
const upload = multer({ dest: "uploads/" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zipDirPath = path.join(__dirname, "/public/zip");
const lokiRefPath = path.join(__dirname, ".loki/reference");
const uploadDirPath = path.join(__dirname, "/uploads");
const storybooksDirPath = path.join(__dirname, "/storybooks");

let child = null;
let lastZip = null;

mkdirSync(uploadDirPath, { recursive: true });
mkdirSync(zipDirPath, { recursive: true });

for (const file of await fs.readdir(uploadDirPath)) {
  await fs.unlink(path.join(uploadDirPath, file));
}
for (const file of await fs.readdir(zipDirPath)) {
  await fs.unlink(path.join(zipDirPath, file));
}

app.use(express.static("public"));

app.post("/update", upload.single("file"), (req, res) => {
  if (child !== null) {
    res.send({ error: "Check in progress..." });
    return;
  }

  const storybookDirPath = path.join(storybooksDirPath, req.file.filename);
  const outputZipPath = path.join(zipDirPath, req.file.filename + ".zip");
  const outputWS = createWriteStream(outputZipPath);
  const archive = archiver("zip", {
    zlib: { level: 8 },
  });

  const onProcessClose = (_code) => {
    archive.pipe(outputWS);
    archive.directory(lokiRefPath, false);
    archive.finalize();
  };

  const onProcessError = () => {
    child = null;
    lastZip = null;

    res.send({ error: error.message });
  };

  outputWS.on("close", () => {
    child = null;
    lastZip = outputZipPath;

    res.send({ file: outputZipPath });
  });

  decompress(req.file.path, storybookDirPath)
    .then((files) => {
      const isWrapped = files.some(
        (file) => file.path === "storybook-static/" && file.type === "directory"
      );
      const sbPath = isWrapped
        ? storybookDirPath + "/storybook-static"
        : storybookDirPath;

      child = spawn("npx", [
        "loki",
        "update",
        "--chromeConcurrency",
        "48",
        "--reactUri",
        `file:${sbPath}`,
        "--chromeDockerUseCopy",
        "true",
      ]);

      child.stdout.on("data", (data) => {
        console.log(`stdout:\n${data}`);
      });

      child.stderr.on("data", (data) => {
        console.error(`stderr: ${data}`);
      });

      child.on("error", onProcessError);
      child.on("close", onProcessClose);
    })
    .catch((error) => {
      res.send(error);
    });
});

app.get("/status", (req, res) => {
  res.send({ work: child !== null, lastZip });
});

app.listen(3000, () => {
  console.log("Listen on 3000 port");
});
