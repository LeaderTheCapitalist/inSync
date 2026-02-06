import { GoogleGenAI, Type } from "@google/genai";
import { Activity, ScheduleItem, MicroActivity, Priority, Timeframe } from "../types";

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

// Updated model names as per user request
const LITE_MODEL = 'gemini-2.0-flash-lite';
const MAIN_MODEL = 'gemini-2.5-flash';

export const geminiService = {
  async generateSchedule(activities: Activity[], timeframes: Timeframe[]): Promise<ScheduleItem[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const activeTimeframes = timeframes.filter(tf => tf.isActive);
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: MAIN_MODEL,
        contents: `Generate a COMPREHENSIVE 24-HOUR daily schedule.
        
        Mission Deck: ${JSON.stringify(activities)}
        
        Busy Hours (BLOCKED TIME - DO NOT SCHEDULE MISSIONS HERE):
        ${JSON.stringify(activeTimeframes)}
        
        Logic:
        1. SLEEP: 11 PM - 7 AM is 'Rest'.
        2. MISSIONS: Distribute based on difficulty.
        3. BLOCKED SLOTS: If a busy hour entry is present, mark that time as type 'busy' and title it using that entry's title.
        4. VARIETY: Interleave 'Task' with 'Break' and 'Habit'.
        5. ICONS (MANDATORY): Choose a contextually appropriate icon from the Solar Icon set for EVERY item. 
           FORMAT: 'solar:[icon-name]-outline'. 
           RESTRICTION: ONLY use the '-outline' variant. 
           Examples: solar:book-outline, solar:cup-outline, solar:code-outline, solar:walking-outline.
        6. NOTES: One encouraging cognitive note per item. Use MARKDOWN (**bold**, *italics*) for emphasis.
        7. CASING: All titles and types must be Title Case.
        
        Return a chronological JSON array. Time format: 'HH:MM AM/PM'.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                title: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['task', 'break', 'habit', 'rest', 'busy'] },
                aiNote: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ['Urgent', 'Important', 'Normal'] },
                icon: { type: Type.STRING }
              },
              required: ["time", "title", "type", "aiNote", "priority", "icon"]
            }
          }
        }
      });
      return JSON.parse(response.text || '[]');
    });
  },

  async generateMicroActivities(activities: Activity[]): Promise<MicroActivity[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: LITE_MODEL,
        contents: `Suggest 4 quick (2-min) micro-activities based on current missions: ${JSON.stringify(activities)}. 
        IMPORTANT: The "text" field MUST contain ONLY the activity name (e.g., "Deep Breath"). DO NOT include emojis or icons in the text field. 
        Put a single emoji in the "icon" field. Ensure activity text is Title Case.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                icon: { type: Type.STRING }
              },
              required: ["id", "text", "icon"]
            }
          }
        }
      });
      return JSON.parse(response.text || '[]');
    });
  },

  async getDailyInsights(activities: Activity[]): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: LITE_MODEL,
        contents: `Provide a strategic focus insight (15 words max) for these missions: ${JSON.stringify(activities)}. Use Markdown for **emphasis**. Ensure all text is Title Case.`,
        config: {
          systemInstruction: "You are an elite high-performance coach. Be punchy, wise, and use markdown. Use Title Case for all sentences."
        }
      });
      return response.text?.trim() || "Focus On The High-Impact Missions Today.";
    });
  },

  async askGrowthLab(query: string, activities: Activity[]): Promise<{ text: string, sources?: { title: string, uri: string }[] }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: MAIN_MODEL,
        contents: `Query: "${query}". Context: ${JSON.stringify(activities)}. Explain using cognitive science. Use Google Search to find up-to-date scientific papers or performance tips if needed.`,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: "You are the inSync Growth Lab. Provide scientific advice using clean Markdown formatting. Cite web sources if you use Google Search."
        }
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title || 'Source',
        uri: chunk.web?.uri || '#'
      })).filter((s: any) => s.uri !== '#');

      return {
        text: response.text || "Analyzing Your Cognitive Request...",
        sources
      };
    });
  }
};