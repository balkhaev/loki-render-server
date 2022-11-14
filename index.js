import express from "express";
import multer from "multer";
import decompress from "decompress";
import path from "path";
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "fs";

const upload = multer({ dest: "uploads/" });
const app = express();

app.use(express.static("public"));

app.post("/check", upload.single("file"), (req, res) => {
  const unzipToDir = path.resolve("storybooks/" + req.file.filename);

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
        "32",
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
        console.log(`child process exited with code ${code}`);
      });

      res.send(files.map((file) => file.path));
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
