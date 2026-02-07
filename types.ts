
export type Priority = 'Urgent' | 'Important' | 'Normal';
export type Difficulty = 'Hard' | 'Medium' | 'Easy';
export type Category = 'Study' | 'Task' | 'Fitness' | 'Personal';
export type RepeatType = 'Today' | 'Days' | 'Weeks' | 'Months' | 'Years';

export interface Activity {
  id: string;
  title: string;
  category: Category;
  priority: Priority;
  difficulty: Difficulty;
  icon?: string;
}

export interface UserPreference {
  id: string;
  text: string;
  type: 'like' | 'dislike';
}

export interface Timeframe {
  id: string;
  title: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  anchorType: 'Date' | 'Weekday';
  anchorValue: string; // YYYY-MM-DD or Monday, Tuesday, etc.
  repeatType: RepeatType;
  repeatFrequency: number;
  repeatFrom?: string; // Date
  repeatTill?: string; // Date
  isActive: boolean;
}

export interface MicroActivity {
  id: string;
  text: string;
  icon: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  type: 'task' | 'break' | 'habit' | 'rest' | 'busy';
  aiNote: string;
  priority: Priority;
  icon: string;
}

export interface AppState {
  activities: Activity[];
  timeframes: Timeframe[];
  microActivities: MicroActivity[];
  schedule: ScheduleItem[];
  insights: string;
  isSyncing: boolean;
  growthLabResponse: string;
  preferences: UserPreference[];
}
