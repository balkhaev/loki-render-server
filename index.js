import express from "express";
import multer from "multer";
import decompress from "decompress";
import path from "path";
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "fs";
import archiver from "archiver";
import fs from "node:fs/promises";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lokiRefPath = path.join(__dirname, ".loki/reference");
const uploadDirPath = path.join(__dirname, "/uploads");
const downloadDirPath = path.join(__dirname, "/downloads");
const storybooksDirPath = path.join(__dirname, "/storybooks");

const upload = multer({ dest: "uploads/" });
const app = express();

app.use(express.static("public"));

const archive = archiver("zip", {
  zlib: { level: 9 },
});

app.post("/check", upload.single("file"), (req, res) => {
  const unzipToDir = path.join(storybooksDirPath, req.file.filename);
  const outputZipPath = path.join(downloadDirPath, req.file.filename + ".zip");
  const output = createWriteStream(outputZipPath);

  decompress(req.file.path, unzipToDir)
    .then((files) => {
      const isWrapped = files.some(
        (file) => file.path === "storybook-static/" && file.type === "directory"
      );
      const sbPath = isWrapped ? unzipToDir + "/storybook-static" : unzipToDir;

      console.log({ isWrapped, sbPath });

      const child = spawn("npx", [
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

      child.on("error", (error) => {
        console.error(`error: ${error.message}`);
      });

      child.on("close", (code) => {
        output.on("close", function () {
          console.log(archive.pointer() + " total bytes");
          console.log(
            "archiver has been finalized and the output file descriptor has closed."
          );
          res.sendFile(outputZipPath);
        });
        output.on("end", function () {
          console.log("Data has been drained");
        });
        archive.pipe(output);
        archive.directory(lokiRefPath, false);
        archive.finalize();
      });
    })
    .catch((error) => {
      res.send(error);
    });
});

mkdirSync(uploadDirPath, { recursive: true });
mkdirSync(downloadDirPath, { recursive: true });

for (const file of await fs.readdir(uploadDirPath)) {
  await fs.unlink(path.join(uploadDirPath, file));
}
for (const file of await fs.readdir(downloadDirPath)) {
  await fs.unlink(path.join(downloadDirPath, file));
}

app.listen(3000, () => {
  console.log("Listen on 3000 port");
});
