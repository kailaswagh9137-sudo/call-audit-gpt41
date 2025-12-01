import express from "express";
import multer from "multer";
import fs from "fs";
import { exec } from "child_process";
import OpenAI from "openai";

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// multer: uploads/ folder
const upload = multer({ dest: "uploads/" });

// ensure folders exist
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("processed")) fs.mkdirSync("processed");

app.get("/", (req, res) => {
  res.send("Call Audit Backend (GPT-4o-audio-preview + GPT-4.1) ✅");
});

// HELPER: run ffmpeg
function runFFMPEG(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("🚨 FFMPEG ERROR:", stderr || error);
        reject(error);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
}

// HELPER: GPT-4o-audio-preview transcription for ONE channel
async function transcribeChannel(filePath, speakerLabel) {
  console.log(`🧠 Transcribing ${speakerLabel} from:`, filePath);

  const audioBuffer = fs.readFileSync(filePath);
  const audioBase64 = audioBuffer.toString("base64");

  const response = await openai.responses.create({
    model: "gpt-4o-audio-preview",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            audio: {
              data: audioBase64,
              format: "wav"
            }
          },
          {
            type: "input_text",
            text: `
You are transcribing the ${speakerLabel} side of a stereo call recording.

RULES:
- Transcribe EXACT spoken words (Hindi + English mix allowed).
- Do NOT correct grammar.
- Do NOT summarize.
- Do NOT add or remove words.
- Keep bad words as-is.
- This channel is ONLY the ${speakerLabel}, no need to mark speaker.
            `
          }
        ]
      }
    ]
  });

  // Response structure: output[0].content[0].text (typical in new Responses API)
  const outBlock = response.output?.[0];
  let transcriptText = "";

  if (outBlock && Array.isArray(outBlock.content)) {
    const textPart = outBlock.content.find((c) => c.type === "output_text");
    if (textPart) transcriptText = textPart.text;
  }

  if (!transcriptText) {
    console.log("⚠️ Could not parse output_text, raw response:", JSON.stringify(response, null, 2));
    transcriptText = JSON.stringify(response);
  }

  return transcriptText.trim();
}

// MAIN ENDPOINT: stereo file → agent + customer text
app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    console.log("🔥 Received /transcribe request");
    console.log("File:", req.file);

    const input = req.file.path;
    const agentFile = `processed/${req.file.filename}_agent.wav`;
    const customerFile = `processed/${req.file.filename}_customer.wav`;

    console.log("🎧 Splitting channels via ffmpeg...");

    // Left channel (0.0.0) → agent, Right (0.0.1) → customer
    await runFFMPEG(
      `ffmpeg -y -i ${input} -map_channel 0.0.0 ${agentFile} -map_channel 0.0.1 ${customerFile}`
    );

    console.log("✔ FFMPEG complete. Files:");
    console.log("Agent file:", agentFile);
    console.log("Customer file:", customerFile);

    // Transcribe both channels using GPT-4o-audio-preview
    const [agentText, customerText] = await Promise.all([
      transcribeChannel(agentFile, "AGENT"),
      transcribeChannel(customerFile, "CUSTOMER")
    ]);

    console.log("✔ Both channels transcribed.");

    // Simple merged text (next step we can convert to time-stamped dialog)
    const mergedPlain = `
=== AGENT (Left channel) ===
${agentText}

=== CUSTOMER (Right channel) ===
${customerText}
    `.trim();

    return res.json({
      status: "ok",
      message: "Stereo audio processed with GPT-4o-audio-preview.",
      agent_text: agentText,
      customer_text: customerText,
      merged_plain: mergedPlain
    });
  } catch (err) {
    console.error("❗ ERROR:", err);
    return res.status(500).json({
      status: "error",
      error: err.message || String(err)
    });
  }
});

// PORT
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
