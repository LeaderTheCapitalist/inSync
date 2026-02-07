import { GoogleGenAI, Type } from "@google/genai";
import { Activity, ScheduleItem, MicroActivity, Priority, Timeframe, UserPreference } from "../types";

const retryWrapper = async <T,>(fn: () => Promise<T>, retries = 2): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (error?.message?.includes('429') || error?.status === 429) {
      throw new Error("QUOTA_EXCEEDED");
    }
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 2000));
      return retryWrapper(fn, retries - 1);
    }
    throw error;
  }
};

// Explicitly using Gemini 2.0 models as requested
const LITE_MODEL = 'gemini-2.0-flash-lite';
const MAIN_MODEL = 'gemini-2.0-flash';

export const geminiService = {
  async generateSchedule(activities: Activity[], timeframes: Timeframe[], preferences: UserPreference[]): Promise<ScheduleItem[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const activeTimeframes = timeframes.filter(tf => tf.isActive);
    
    const likes = preferences.filter(p => p.type === 'like').map(p => p.text);
    const dislikes = preferences.filter(p => p.type === 'dislike').map(p => p.text);

    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: MAIN_MODEL,
        contents: `Generate a COMPREHENSIVE 24-HOUR daily schedule.
        
        Mission Deck (Tasks to do): ${JSON.stringify(activities)}
        
        Busy Hours (MANDATORY BLOCKED SLOTS): ${JSON.stringify(activeTimeframes)}
        
        User Preferences:
        - Favor: ${likes.join(', ') || 'High performance balance'}
        - Exclude: ${dislikes.join(', ') || 'None'}
        
        Cognitive Planning Logic:
        1. SLEEP: 11 PM - 7 AM is strictly 'Rest'.
        2. MISSIONS: Distribute based on difficulty. Tackle 'Hard' tasks during peak hours (8 AM - 12 PM).
        3. CONTEXTUAL TRANSITIONS: You MUST include every busy hour. 
           CRITICAL: Analyze the title of the busy hour. If it's "Dinner", add "Prep" before. If it's "Class", add "Recap" after. If it's a meeting, add "Action Items" after.
        4. PREFERENCES: Integrate likes (e.g., Coffee, Walks) and respect dislikes.
        5. NO REPETITION: Do not output multiple consecutive identical blocks (e.g., merge 3 rows of 'Rest' into one 8-hour block).
        6. ICONS: For the 'icon' field, provide ONE contextually relevant EMOJI.
        7. AI NOTES: One punchy, science-backed note in Markdown for each item.
        8. CASING: Use Title Case for all titles and types.
        
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
      
      const rawItems = JSON.parse(response.text || '[]') as ScheduleItem[];
      
      const merged: ScheduleItem[] = [];
      for (const curr of rawItems) {
        if (merged.length > 0) {
          const prev = merged[merged.length - 1];
          if (prev.title.toLowerCase() === curr.title.toLowerCase() && prev.type === curr.type) {
            continue; 
          }
        }
        merged.push(curr);
      }
      return merged;
    });
  },

  async generateMicroActivities(activities: Activity[]): Promise<MicroActivity[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: LITE_MODEL,
        contents: `Suggest 4 quick (2-min) high-impact micro-habits based on current missions: ${JSON.stringify(activities)}. 
        Include a single relevant emoji for 'icon'. Use Title Case.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                icon: { type: Type.STRING }
              },
              required: ["text", "icon"]
            }
          }
        }
      });
      
      const rawData = JSON.parse(response.text || '[]');
      return rawData.map((item: any) => ({
        ...item,
        id: crypto.randomUUID()
      }));
    });
  },

  async getDailyInsights(activities: Activity[]): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: LITE_MODEL,
        contents: `Provide a 15-word maximum daily focus strategy based on missions: ${JSON.stringify(activities)}. Use Markdown.`,
        config: {
          systemInstruction: "You are an elite productivity scientist. Be brief, encouraging, and authoritative."
        }
      });
      return response.text?.trim() || "Focus On High-Impact Missions Today.";
    });
  },

  async askGrowthLab(query: string, activities: Activity[]): Promise<{ text: string, sources?: { title: string, uri: string }[] }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWrapper(async () => {
      const response = await ai.models.generateContent({
        model: MAIN_MODEL,
        contents: `Query: "${query}". Mission Context: ${JSON.stringify(activities)}. Answer with scientific grounding and search data.`,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: "You are the inSync Growth Lab. Provide data-driven answers. Cite sources."
        }
      });

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = groundingChunks?.map((chunk: any) => ({
        web: {
          title: chunk.web?.title || 'Source',
          uri: chunk.web?.uri || '#'
        }
      })).filter((s: any) => s.web.uri !== '#').map((s: any) => s.web);

      return { text: response.text || "Analyzing data...", sources };
    });
  }
};