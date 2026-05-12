const cron = require('node-cron');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const OpenAI = require('openai'); // Fixed for NVIDIA NIM compatibility

const execAsync = util.promisify(exec);

// NOTE: Add NVIDIA_API_KEY to your root .env file
const ai = process.env.NVIDIA_API_KEY ? new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY
}) : null;

console.log("🚀 [Nexus Auto-Agent] Booting up continuous CEO loop (NVIDIA NIM)...");
console.log("⏰ Scheduling 15-minute cron job...");

async function getProjectState() {
    try {
        const { stdout } = await execAsync('git log -n 3 --oneline');
        return stdout || "No recent commits.";
    } catch (e) {
        return "No git log available.";
    }
}

async function runAutonomousCycle() {
    const time = new Date().toLocaleTimeString();
    console.log(`\n===========================================`);
    console.log(`[${time}] 🤖 Triggering Autonomous Cycle...`);
    
    if(!ai) {
         console.log(`[${time}] ❌ ERROR: NVIDIA_API_KEY is missing from .env!`);
         console.log(`Add NVIDIA_API_KEY=your_key to g:\\Quantchat\\Nexus\\.env`);
         return;
    }

    try {
        const state = await getProjectState();
        console.log(`[${time}] Checked latest commits...`);
        
        const systemInstruction = "You are the autonomous CEO agent for Project Nexus (a WhatsApp/Telegram competitor). Devise the next massive integration.";
        const prompt = `Recent commits:\n${state}\n\nWhat is the absolute highest priority feature to build next to beat Snapchat/Telegram? Output a solid 2-sentence engineering directive.`;
        
        console.log(`[${time}] Pinging NVIDIA NIM (Llama-3.1-70B) Endpoint...`);
        
        const response = await ai.chat.completions.create({
            model: 'meta/llama-3.1-70b-instruct',
            messages: [
                { role: "system", "content": systemInstruction },
                { role: "user", "content": prompt }
            ],
            temperature: 0.8,
            max_tokens: 256
        });
        
        const output = response.choices[0].message.content;
        console.log(`\n💡 [AI DIRECTIVE]:\n${output}\n`);
        
        const logPath = path.join(__dirname, '..', 'nexus_autonomous.log');
        fs.appendFileSync(logPath, `\n[${time}] CEO AI Target:\n${output}\n`);
        
        console.log(`[${time}] 📝 Logged to nexus_autonomous.log. Waiting 15 minutes...`);
    } catch (err) {
        console.error(`[${time}] ❌ Loop Error:`, err.message);
    }
}

// Initial boot
runAutonomousCycle();

// Run every 15 minutes
cron.schedule('*/15 * * * *', () => {
    runAutonomousCycle();
});

console.log("✅ Loop Established via NVIDIA NIM. App will orchestrate itself forever.");
