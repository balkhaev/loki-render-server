import express from "express";
import multer from "multer";
import decompress from "decompress";
import path from "path";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "fs";
import archiver from "archiver";

const upload = multer({ dest: "uploads/" });
const app = express();

const lokiPath = path.resolve(".loki/reference");

app.use(express.static("public"));

const archive = archiver("zip", {
  zlib: { level: 9 },
});

app.post("/check", upload.single("file"), (req, res) => {
  const unzipToDir = path.resolve("storybooks/" + req.file.filename);
  const outputZipPath = path.resolve("downloads/" + req.file.filename + ".zip");
  const output = fs.createWriteStream(outputZipPath);

  console.log(unzipToDir);

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
        archive.directory(lokiPath, false);
        archive.finalize();
      });
    })
    .catch((error) => {
      res.send(error);
    });
});

rmSync("./uploads", { recursive: true, force: true });
rmSync("./storybooks", { recursive: true, force: true });
mkdirSync("./uploads");

app.listen(3000, () => {
  console.log("Listen on 3000 port");
});
