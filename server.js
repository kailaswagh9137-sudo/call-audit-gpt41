import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import { exec } from "child_process";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("Call Audit GPT-4.1 Backend Running 🚀");
});

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  console.log("🔥 Received /transcribe request");
  console.log("FILE:", req.file);

  res.json({
    status: "ok",
    msg: "audio successfully received — processing coming next"
  });
});

app.listen(4000, () => {
  console.log("Server running at port 4000");
});
