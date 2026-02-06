import { GoogleGenAI, SchemaType } from "@google/genai";
import { Activity, ScheduleItem, MicroActivity, Priority, Timeframe } from "../types";

// Initialize the API with your key from the environment
// Note: If using Vite, use import.meta.env.VITE_GEMINI_API_KEY
const genAI = new GoogleGenAI(process.env.API_KEY || "sk-61j5CqwUm7jX7gW1kec8DCfHqgnHeRQAQYrHEBReVpyEcfp1");

const LITE_MODEL_NAME = 'gemini-1.5-flash'; 
const MAIN_MODEL_NAME = 'gemini-1.5-flash'; // Or 'gemini-1.5-pro' for better reasoning

const retryWrapper = async <T,>(fn: () => Promise<T>, retries = 2): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error?.message?.includes('429')) {
      throw new Error("QUOTA_EXCEEDED");
    }
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return retryWrapper(fn, retries - 1);
    }
    throw error;
  }
};

export const geminiService = {
  async generateSchedule(activities: Activity[], timeframes: Timeframe[]): Promise<ScheduleItem[]> {
    const model = genAI.getGenerativeModel({ 
        model: MAIN_MODEL_NAME,
        generationConfig: {
            responseMimeType: "application/json",
            // Corrected Schema syntax for the SDK
            responseSchema: {
                type: SchemaType.ARRAY,
                items: {
                    type: SchemaType.OBJECT,
                    properties: {
                        time: { type: SchemaType.STRING },
                        title: { type: SchemaType.STRING },
                        type: { type: SchemaType.STRING },
                        aiNote: { type: SchemaType.STRING },
                        priority: { type: SchemaType.STRING }, // Use enum strings here
                        icon: { type: SchemaType.STRING }
                    },
                    required: ["time", "title", "type", "aiNote", "priority", "icon"]
                }
            }
        }
    });

    const activeTimeframes = timeframes.filter(tf => tf.isActive);
    
    return retryWrapper(async () => {
      const prompt = `Generate a COMPREHENSIVE 24-HOUR daily schedule.
        Mission Deck: ${JSON.stringify(activities)}
        Busy Hours (BLOCKED TIME): ${JSON.stringify(activeTimeframes)}
        Logic: 11PM-7AM Rest, Interleave Tasks/Breaks, Title Case only.
        Icons: 'solar:[icon-name]-outline'.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(response.text());
    });
  },

  async getDailyInsights(activities: Activity[]): Promise<string> {
    const model = genAI.getGenerativeModel({ 
        model: LITE_MODEL_NAME,
        systemInstruction: "You are an elite high-performance coach. Be punchy, wise, and use markdown. Use Title Case."
    });

    return retryWrapper(async () => {
      const prompt = `Provide a strategic focus insight (15 words max) for: ${JSON.stringify(activities)}.`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim() || "Focus On High-Impact Missions.";
    });
  }
};
