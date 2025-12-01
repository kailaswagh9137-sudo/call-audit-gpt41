import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const app = express();
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const execFFMPEG = (cmd) =>
    new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) return reject(error);
            resolve(stdout || stderr);
        });
    });

app.get("/", (req, res) => {
    res.send("Call Audit GPT-4.1 Backend Running 🚀");
});

app.post("/transcribe", upload.single("audio"), async (req, res) => {
    console.log("🔥 Received /transcribe request");
    console.log("File:", req.file);

    const filePath = req.file.path;

    try {
        // split stereo into left + right
        console.log("🎧 Splitting channels...");
        await execFFMPEG(
            `ffmpeg -i ${filePath} -map_channel 0.0.0 uploads/agent.wav -map_channel 0.0.1 uploads/customer.wav`
        );

        console.log("✔ Done — Channels separated");

        const agentTranscript = await transcribe("uploads/agent.wav");
        const customerTranscript = await transcribe("uploads/customer.wav");

        return res.json({
            status: "ok",
            agent: agentTranscript,
            customer: customerTranscript
        });

    } catch (err) {
        console.error("❗ ERROR:", err);
        return res.status(500).json({
            status: "error",
            error: err.toString()
        });
    }
});

async function transcribe(file) {
    console.log(`🧠 Transcribing: ${file}...`);
    const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini-tts",
        audio: fs.readFileSync(file)
    });

    return response.text;
}

app.listen(4000, () => console.log("🚀 Running on port 4000"));
