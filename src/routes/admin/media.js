"use strict";

const express = require("express");
const multer = require("multer");
const config = require("../../config");
const logger = require("../../lib/logger");
const { processImage, UploadError } = require("../../lib/images");
const { download } = require("../../lib/remote-image");
const media = require("../../repositories/media");
const { audit } = require("../../repositories/audit");

const router = express.Router();

// In memory: the file is validated and resized before anything touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes, files: 1, fields: 5 },
});

async function store(req, buffer, name) {
  const row = await processImage(buffer, name);
  const saved = await media.insert(row, req.session.user.id);
  await audit(req, { action: "upload", entity: "media", entityId: saved.id, summary: `uploaded ${name}`.slice(0, 255) });
  media.pruneOrphans().catch((err) => logger.warn({ err }, "media prune failed"));
  return media.forClient(saved);
}

router.post("/", (req, res, next) => {
  upload.single("file")(req, res, async (err) => {
    try {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") throw new UploadError(`Images must be smaller than ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB.`, 413);
        throw err;
      }
      if (!req.file) throw new UploadError("Choose an image to upload.");
      res.status(201).json({ media: await store(req, req.file.buffer, req.file.originalname) });
    } catch (e) {
      next(e);
    }
  });
});

router.post("/import", async (req, res, next) => {
  try {
    const { buffer, name } = await download(req.body?.url);
    res.status(201).json({ media: await store(req, buffer, name) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
