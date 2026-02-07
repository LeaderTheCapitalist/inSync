import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Icon } from '@iconify/react';
import ReactMarkdown from 'react-markdown';
import { Activity, MicroActivity, ScheduleItem, Category, Priority, Difficulty, Timeframe, RepeatType, UserPreference } from './types';
import { geminiService } from './services/geminiService';

const CATEGORIES: Category[] = ['Study', 'Task', 'Fitness', 'Personal'];
const PRIORITIES: Priority[] = ['Urgent', 'Important', 'Normal'];
const DIFFICULTIES: Difficulty[] = ['Hard', 'Medium', 'Easy'];

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => {
    return (word.charAt(0).toUpperCase() + word.slice(1));
  }).join(' ');
};

interface DoneItem {
  id: string;
  text: string;
  icon: string;
  timestamp: string;
  unixTimestamp: number;
}

interface GrowthResponse {
  text: string;
  sources?: { title: string, uri: string }[];
}

export default function App() {
  const loadInitialState = <T,>(key: string, defaultValue: T): T => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [activities, setActivities] = useState<Activity[]>(() => loadInitialState('insync_activities', [
    { id: '1', title: 'System Design Deep Work', category: 'Study', priority: 'Urgent', difficulty: 'Hard' },
    { id: '2', title: 'Hydration and Mobility', category: 'Fitness', priority: 'Normal', difficulty: 'Easy' }
  ]));
  const [timeframes, setTimeframes] = useState<Timeframe[]>(() => loadInitialState('insync_busy', []));
  const [preferences, setPreferences] = useState<UserPreference[]>(() => loadInitialState('insync_prefs', []));
  const [microActivities, setMicroActivities] = useState<MicroActivity[]>(() => loadInitialState('insync_micro', []));
  const [doneItems, setDoneItems] = useState<DoneItem[]>(() => loadInitialState('insync_done', []));
  const [schedule, setSchedule] = useState<ScheduleItem[]>(() => loadInitialState('insync_schedule', []));
  const [insights, setInsights] = useState(() => loadInitialState('insync_insights', 'System Initialized. Ready For **Peak Focus**.'));
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMicroLoading, setIsMicroLoading] = useState(false);
  const [isGrowthLoading, setIsGrowthLoading] = useState(false);
  const [growthQuery, setGrowthQuery] = useState('');
  const [growthLabResponse, setGrowthLabResponse] = useState<GrowthResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTimeframeModalOpen, setIsTimeframeModalOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<'busy' | 'like' | 'dislike'>('busy');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isScheduleHistoryOpen, setIsScheduleHistoryOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [microError, setMicroError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTaskRef = useRef<HTMLDivElement>(null);

  // Form States - Activity
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<Category>('Study');
  const [formPriority, setFormPriority] = useState<Priority>('Important');
  const [formDifficulty, setFormDifficulty] = useState<Difficulty>('Medium');

  // Form States - Timeframes
  const [tfTitle, setTfTitle] = useState('');
  const [tfStart, setTfStart] = useState('09:00');
  const [tfEnd, setTfEnd] = useState('10:00');

  // Form States - Preferences
  const [prefText, setPrefText] = useState('');

  useEffect(() => {
    localStorage.setItem('insync_activities', JSON.stringify(activities));
    localStorage.setItem('insync_busy', JSON.stringify(timeframes));
    localStorage.setItem('insync_prefs', JSON.stringify(preferences));
    localStorage.setItem('insync_schedule', JSON.stringify(schedule));
    localStorage.setItem('insync_micro', JSON.stringify(microActivities));
    localStorage.setItem('insync_done', JSON.stringify(doneItems));
    localStorage.setItem('insync_insights', JSON.stringify(insights));
  }, [activities, timeframes, preferences, schedule, microActivities, doneItems, insights]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTaskRef.current && scrollContainerRef.current) {
      activeTaskRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [schedule, currentTime.getMinutes()]);

  const syncEverything = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setErrorMessage(null);
    try {
      const [newSchedule, newInsights] = await Promise.all([
        geminiService.generateSchedule(activities, timeframes, preferences),
        geminiService.getDailyInsights(activities)
      ]);
      setSchedule(newSchedule);
      setInsights(newInsights);
    } catch (e: any) {
      setErrorMessage(e.message === 'QUOTA_EXCEEDED' ? "Daily Limit Reached." : "Sync Connection Failed.");
    } finally {
      setIsSyncing(false);
    }
  }, [activities, timeframes, preferences, isSyncing]);

  const refreshMicro = useCallback(async () => {
    if (isMicroLoading) return;
    setIsMicroLoading(true);
    setMicroError(null);
    try {
      const micros = await geminiService.generateMicroActivities(activities);
      setMicroActivities(micros);
    } catch (e: any) {
      if (e.message === 'QUOTA_EXCEEDED') {
        setMicroError("Daily Limit Reached.");
      }
    } finally {
      setIsMicroLoading(false);
    }
  }, [activities, isMicroLoading]);

  useEffect(() => {
    if (schedule.length === 0) syncEverything();
    if (microActivities.length === 0 && !microError) refreshMicro();
  }, []);

  const parseTimeToMinutes = (timeStr: string) => {
    const parts = timeStr.trim().split(' ');
    if (parts.length < 2) return 0;
    const [time, modifier] = parts;
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
    if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
    return hours * 60 + (minutes || 0);
  };

  const currentTaskIndex = useMemo(() => {
    if (schedule.length === 0) return -1;
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    let activeIdx = -1;
    for (let i = 0; i < schedule.length; i++) {
      const taskMinutes = parseTimeToMinutes(schedule[i].time);
      if (nowMinutes >= taskMinutes) activeIdx = i;
      else break;
    }
    return activeIdx;
  }, [schedule, currentTime]);

  const visibleSchedule = useMemo(() => {
    if (schedule.length === 0) return [];
    if (currentTaskIndex === -1) return schedule;
    return schedule.slice(currentTaskIndex);
  }, [schedule, currentTaskIndex]);

  const pastSchedule = useMemo(() => {
    if (schedule.length === 0 || currentTaskIndex === -1) return [];
    return [...schedule.slice(0, currentTaskIndex)].reverse();
  }, [schedule, currentTaskIndex]);

  const currentStatus = useMemo(() => {
    if (activities.length === 0) return { label: 'Idle', color: 'text-slate-400', bg: 'bg-slate-50' };
    const difficultyWeight = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
    const priorityWeight = { 'Normal': 1, 'Important': 2, 'Urgent': 3 };
    const totalHeat = activities.reduce((acc, curr) => {
      return acc + (difficultyWeight[curr.difficulty] || 0) + (priorityWeight[curr.priority] || 0);
    }, 0);
    if (totalHeat < 5) return { label: 'Chill', color: 'text-sky-500', bg: 'bg-slate-100' };
    if (totalHeat < 9) return { label: 'Casual', color: 'text-emerald-500', bg: 'bg-emerald-50' };
    if (totalHeat < 14) return { label: 'Normal', color: 'text-indigo-500', bg: 'bg-indigo-50' };
    if (totalHeat < 20) return { label: 'Busy', color: 'text-amber-500', bg: 'bg-amber-50' };
    return { label: 'Overloaded', color: 'text-rose-500', bg: 'bg-rose-50' };
  }, [activities]);

  const handleAddActivity = () => {
    if (!formTitle.trim()) return;
    const newAct: Activity = {
      id: crypto.randomUUID(),
      title: toTitleCase(formTitle.trim()),
      category: formCategory,
      priority: formPriority,
      difficulty: formDifficulty
    };
    setActivities(prev => [...prev, newAct]);
    setFormTitle('');
    setIsModalOpen(false);
  };

  const handleAddPreference = (type: 'like' | 'dislike') => {
    if (!prefText.trim()) return;
    const newPref: UserPreference = {
      id: crypto.randomUUID(),
      text: prefText.trim(),
      type: type
    };
    setPreferences(prev => [...prev, newPref]);
    setPrefText('');
  };

  const handleAddTimeframe = () => {
    if (!tfTitle.trim()) return;
    const newTf: Timeframe = {
      id: crypto.randomUUID(),
      title: toTitleCase(tfTitle.trim()),
      startTime: tfStart,
      endTime: tfEnd,
      anchorType: 'Weekday',
      anchorValue: 'Daily',
      repeatType: 'Today',
      repeatFrequency: 1,
      isActive: true
    };
    setTimeframes(prev => [...prev, newTf]);
    setTfTitle('');
    setIsTimeframeModalOpen(false);
  };

  const toggleTimeframe = (id: string) => {
    setTimeframes(prev => prev.map(tf => tf.id === id ? { ...tf, isActive: !tf.isActive } : tf));
  };

  const deleteTimeframe = (id: string) => {
    setTimeframes(prev => prev.filter(tf => tf.id !== id));
  };

  const deletePreference = (id: string) => {
    setPreferences(prev => prev.filter(p => p.id !== id));
  };

  const handleCompleteMicro = (micro: MicroActivity) => {
    setMicroActivities(prev => prev.filter(m => m.id !== micro.id));
    setDoneItems(prev => [
      {
        id: micro.id,
        text: micro.text,
        icon: micro.icon,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unixTimestamp: Date.now()
      },
      ...prev
    ]);
  };

  const handleGrowthQuery = useCallback(async () => {
    if (!growthQuery.trim() || isGrowthLoading) return;
    setIsGrowthLoading(true);
    try {
      const response = await geminiService.askGrowthLab(growthQuery, activities);
      setGrowthLabResponse(response);
    } catch (e: any) {
      setGrowthLabResponse({ text: e.message === 'QUOTA_EXCEEDED' ? "Lab Busy. Try Again Later." : "Connection Failed." });
    } finally {
      setIsGrowthLoading(false);
    }
  }, [growthQuery, activities, isGrowthLoading]);

  const getColorClasses = (value: Priority | Difficulty) => {
    switch (value) {
      case 'Urgent':
      case 'Hard': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'Important':
      case 'Medium': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'Normal':
      case 'Easy': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getCategoryIcon = (cat: Category) => {
    switch (cat) {
      case 'Study': return 'solar:book-outline';
      case 'Fitness': return 'solar:heart-outline';
      case 'Task': return 'solar:checklist-minimalistic-outline';
      case 'Personal': return 'solar:user-circle-outline';
      default: return 'solar:circle-outline';
    }
  };

  const renderScheduleIcon = (item: ScheduleItem, isActive: boolean, isBusy: boolean) => {
    const isEmoji = !item.icon?.includes('solar:');
    if (isEmoji && item.icon) {
      return <span className="text-2xl">{item.icon}</span>;
    }
    return <Icon icon={item.icon || (isBusy ? 'solar:forbidden-circle-outline' : 'solar:star-outline')} className="w-5 h-5" />;
  };

  const STANDARD_CLOSE_BUTTON_CLASSES = "mt-8 py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl font-bold transition-all shadow-sm active:scale-95";
  const SECTION_HEADER_CLASSES = "px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30";
  const PRIMARY_SYNC_BUTTON_CLASSES = "px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:bg-slate-300 disabled:shadow-none h-[40px] whitespace-nowrap";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-20 selection:bg-indigo-100 selection:text-indigo-900">
      <header className="sticky top-0 z-[60] bg-white/70 backdrop-blur-xl border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-100">
              <Icon icon="solar:checklist-minimalistic-bold" className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">inSync</h1>
              <p className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">Time. Resynced</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            <button 
              onClick={() => setIsCustomizeOpen(true)}
              aria-label="Customize Schedule"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all group active:scale-95 shadow-sm"
            >
              <Icon icon="solar:tuning-square-outline" className="w-4 h-4 text-slate-600 group-hover:text-indigo-600" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide hidden md:block">Customize Flow</span>
            </button>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-100 shadow-sm transition-all duration-500 ${currentStatus.bg}`}>
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${currentStatus.color.replace('text', 'bg')}`}></div>
              <span className={`text-sm font-black tracking-tight ${currentStatus.color}`}>{currentStatus.label}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-10">
          {/* Mission Deck */}
          <section className="w-full">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Mission Deck</h2>
                <p className="text-sm text-slate-500 font-medium">Core focus objectives</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="group flex items-center gap-2 bg-slate-900 hover:bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-xl active:scale-95"
              >
                <Icon icon="solar:add-circle-outline" className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                New Mission
              </button>
            </div>
            {activities.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {activities.map(act => (
                  <div key={act.id} className="p-6 bg-white rounded-[32px] border border-slate-200 shadow-sm hover:shadow-xl transition-all flex flex-col gap-4 group relative overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl text-[10px] font-bold text-slate-500 border border-slate-100">
                        <Icon icon={getCategoryIcon(act.category)} className="w-3.5 h-3.5" />
                        {act.category}
                      </div>
                      <button 
                        onClick={() => setActivities(prev => prev.filter(a => a.id !== act.id))}
                        className="p-2 bg-slate-50 opacity-0 group-hover:opacity-100 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      >
                        <Icon icon="solar:trash-bin-trash-outline" className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 leading-tight pr-4">{act.title}</h3>
                    <div className="flex flex-wrap gap-2 mt-auto">
                      <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold flex items-center gap-1.5 ${getColorClasses(act.priority)}`}>
                        <Icon icon="solar:flag-outline" className="w-3 h-3" />
                        {act.priority}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold flex items-center gap-1.5 ${getColorClasses(act.difficulty)}`}>
                        <Icon icon="solar:bolt-outline" className="w-3 h-3" />
                        {act.difficulty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white border border-slate-200 rounded-[40px] shadow-sm border-dashed">
                <Icon icon="solar:checklist-minimalistic-outline" className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="font-bold text-slate-400">Mission Deck Is Empty.</p>
                <button onClick={() => setIsModalOpen(true)} className="mt-4 text-indigo-600 font-bold text-sm hover:underline">Start By Adding A Mission</button>
              </div>
            )}
          </section>

          {/* Micro Activities */}
          <section className="w-full bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm transition-all group">
            <div className={SECTION_HEADER_CLASSES}>
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Icon icon="solar:bolt-outline" className="w-5 h-5 text-indigo-500" />
                  Micro Activities
                </h2>
                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">Quick Focus Sprints</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setIsHistoryModalOpen(true)} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 h-[40px]">
                  <Icon icon="solar:history-outline" className="w-3.5 h-3.5" />
                  History
                </button>
                <button onClick={refreshMicro} disabled={isMicroLoading} className={PRIMARY_SYNC_BUTTON_CLASSES}>
                  <Icon icon="solar:refresh-outline" className={`w-3.5 h-3.5 ${isMicroLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
            <div className="p-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {microError ? (
                <div className="col-span-full py-12 text-center text-rose-500 bg-rose-50/50 rounded-[32px] border border-rose-100 animate-in zoom-in-95">
                  <Icon icon="solar:danger-triangle-outline" className="w-8 h-8 mx-auto mb-2" />
                  <p className="font-black text-sm uppercase tracking-widest">{microError}</p>
                </div>
              ) : microActivities.length > 0 ? microActivities.map(micro => (
                <div 
                  key={micro.id} 
                  onClick={() => handleCompleteMicro(micro)}
                  className="relative p-5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center text-center gap-2 transition-colors shadow-sm group/card cursor-pointer hover:border-emerald-200 hover:bg-emerald-100/60 overflow-hidden min-h-[140px] justify-center animate-in zoom-in-95"
                >
                  <div className="relative h-10 w-10 flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover/card:scale-110 mb-2">
                    <div className="opacity-100 group-hover/card:opacity-0 transition-opacity duration-200 text-3xl">{micro.icon}</div>
                    <Icon icon="solar:check-circle-outline" className="absolute w-8 h-8 text-emerald-600 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200" />
                  </div>
                  <div className="relative w-full">
                    <span className="text-[10px] font-bold leading-tight text-slate-600 opacity-100 group-hover/card:opacity-0 transition-opacity duration-200 px-1 block break-words">{micro.text}</span>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-emerald-700 tracking-wide opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">Done</span>
                  </div>
                </div>
              )) : (
                <div className="col-span-full py-10 text-center text-slate-400 text-sm font-medium italic">Sync missions to generate focus hacks.</div>
              )}
            </div>
          </section>

          {/* Intelligent Schedule */}
          <section className="w-full bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm transition-all">
            <div className={SECTION_HEADER_CLASSES}>
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Icon icon="solar:clock-circle-outline" className="w-5 h-5 text-indigo-500" />
                  Intelligent Schedule
                </h2>
                {currentTaskIndex !== -1 && !errorMessage ? (
                  <p className="text-[10px] font-bold text-indigo-500 mt-1 flex items-center gap-1.5">
                    <Icon icon="solar:play-circle-outline" className="w-3 h-3 animate-pulse" />
                    Focusing: {schedule[currentTaskIndex]?.title}
                  </p>
                ) : (
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">Daily Cognitive Path</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setIsScheduleHistoryOpen(true)} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 h-[40px]">
                  <Icon icon="solar:calendar-minimalistic-outline" className="w-3.5 h-3.5" />
                  History
                </button>
                <button onClick={syncEverything} disabled={isSyncing} className={PRIMARY_SYNC_BUTTON_CLASSES}>
                  <Icon icon="solar:refresh-outline" className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  Sync Flow
                </button>
              </div>
            </div>
            <div ref={scrollContainerRef} className="p-8 space-y-6 max-h-[750px] overflow-y-auto custom-scrollbar scroll-smooth relative bg-slate-50/10">
              {errorMessage ? (
                <div className="py-20 text-center text-rose-500 bg-rose-50/50 rounded-[32px] border border-rose-100 animate-in zoom-in-95">
                  <Icon icon="solar:danger-triangle-outline" className="w-10 h-10 mx-auto mb-4" />
                  <p className="font-black text-sm uppercase tracking-widest">{errorMessage}</p>
                </div>
              ) : visibleSchedule.length > 0 ? (
                <div className="relative space-y-8 before:absolute before:left-[70px] before:top-4 before:bottom-4 before:w-[2px] before:bg-slate-200">
                  {visibleSchedule.map((item, idx) => {
                    const isActive = idx === 0 && currentTaskIndex !== -1;
                    const isBusy = item.type.toLowerCase() === 'busy';
                    return (
                      <div key={`${idx}-${item.time}`} ref={isActive ? activeTaskRef : null} className={`flex items-center gap-8 group transition-all duration-500 ${isActive ? 'scale-[1.02] z-10 relative' : 'opacity-60 grayscale-[0.3] hover:opacity-100 hover:grayscale-0'}`}>
                        <div className="w-16 text-right flex-shrink-0">
                          <span className={`text-[11px] font-black font-mono tracking-tighter ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>{item.time}</span>
                        </div>
                        <div className={`relative z-10 w-10 h-10 rounded-2xl bg-white border transition-all flex items-center justify-center flex-shrink-0 shadow-sm ${isActive ? 'border-indigo-600 ring-4 ring-indigo-50 text-indigo-600' : isBusy ? 'border-amber-200 text-amber-500 bg-amber-50' : 'border-slate-200 text-slate-400'}`}>
                           {renderScheduleIcon(item, isActive, isBusy)}
                        </div>
                        <div className={`flex-1 p-6 rounded-[32px] border transition-all bg-white border-slate-200 ${isActive ? 'ring-2 ring-indigo-600 shadow-2xl shadow-indigo-100/50 -translate-x-1' : isBusy ? 'bg-amber-50/20 border-amber-100' : 'hover:border-slate-300'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <h4 className={`font-bold tracking-tight text-base ${isBusy ? 'text-amber-900' : 'text-slate-900'}`}>{toTitleCase(item.title)}</h4>
                            <div className="flex items-center gap-2">
                              {isActive && <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[8px] font-black animate-pulse">Live</span>}
                              <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold border ${isBusy ? 'bg-amber-100 text-amber-700 border-amber-200' : getColorClasses(item.priority || 'Normal')}`}>
                                {toTitleCase(item.type)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-start gap-2 pt-1 border-t border-slate-50 mt-3">
                            <Icon icon="solar:sparkles-outline" className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isActive ? 'text-indigo-400' : isBusy ? 'text-amber-400' : 'text-slate-300'}`} />
                            <div className="text-xs font-medium italic text-slate-500 leading-relaxed prose-custom">
                              <ReactMarkdown>{item.aiNote}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-40 text-slate-400">
                  <div className="bg-white w-20 h-20 rounded-[32px] flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm animate-pulse">
                    <Icon icon="solar:clock-circle-outline" className="w-10 h-10 text-slate-200" />
                  </div>
                  <p className="font-bold text-lg text-slate-600">Aligning cognitive matrix...</p>
                  <p className="text-sm mt-2">Connecting to performance engine</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 relative">
          <div className="lg:sticky lg:top-28 space-y-8 h-fit">
            {/* Growth Lab */}
            <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl shadow-indigo-900/10 relative overflow-hidden group">
              <div className="flex flex-col gap-6 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 rounded-xl">
                      <Icon icon="solar:chat-round-dots-outline" className="w-6 h-6 text-indigo-600" />
                    </div>
                    <h3 className="font-bold text-xl tracking-tight">Growth Lab</h3>
                  </div>
                  {growthLabResponse && (
                    <button onClick={() => setGrowthLabResponse(null)} className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors">Clear</button>
                  )}
                </div>
                <div className="relative">
                  <input type="text" value={growthQuery} onChange={e => setGrowthQuery(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleGrowthQuery()} placeholder="Ask focus science..." className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-white placeholder:text-slate-500" />
                  <button onClick={handleGrowthQuery} disabled={isGrowthLoading} className="absolute right-2 top-2 bottom-2 bg-indigo-600 text-white px-3 rounded-xl hover:bg-indigo-500 disabled:bg-slate-700 transition-all flex items-center justify-center">
                    <Icon icon={isGrowthLoading ? "solar:refresh-outline" : "solar:plain-2-outline"} className={`w-5 h-5 ${isGrowthLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                {growthLabResponse && (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-sm max-h-[400px] overflow-y-auto custom-scrollbar prose-custom animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-3 text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                      <Icon icon="solar:globus-outline" className="w-3 h-3" /> Grounded Insight
                    </div>
                    <ReactMarkdown>{growthLabResponse.text}</ReactMarkdown>
                    {growthLabResponse.sources && growthLabResponse.sources.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-slate-700">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Sources</p>
                        <div className="flex flex-col gap-2">
                          {growthLabResponse.sources.map((s, idx) => (
                            <a key={idx} href={s.uri} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline flex items-center gap-1.5 transition-colors">
                              <Icon icon="solar:link-outline" className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{s.title}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                <Icon icon="solar:atom-outline" className="w-32 h-32 rotate-12" />
              </div>
            </div>

            {/* Strategic Insight */}
            <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-emerald-50 rounded-xl">
                  <Icon icon="solar:medal-star-outline" className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="font-bold text-slate-900">Strategic Insight</h3>
              </div>
              <div className="text-sm text-slate-600 leading-relaxed font-medium bg-slate-50 p-6 rounded-2xl border border-slate-100 prose-custom">
                <ReactMarkdown>{insights}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Activity Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl animate-in zoom-in-95" role="dialog">
            <h3 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">New Mission</h3>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Objective Title</label>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Finish Calculus Homework" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setFormCategory(cat)} className={`py-3 text-[10px] font-bold rounded-2xl border transition-all ${formCategory === cat ? 'bg-indigo-600 text-white shadow-lg border-indigo-500' : 'bg-white text-slate-500 border-slate-200'}`}>{cat}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Priority</label>
                  {PRIORITIES.map(p => <button key={p} onClick={() => setFormPriority(p)} className={`py-2 text-[10px] font-bold rounded-xl border transition-all ${formPriority === p ? getColorClasses(p) : 'bg-white text-slate-400 border-slate-200'}`}>{p}</button>)}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Effort</label>
                  {DIFFICULTIES.map(d => <button key={d} onClick={() => setFormDifficulty(d)} className={`py-2 text-[10px] font-bold rounded-xl border transition-all ${formDifficulty === d ? getColorClasses(d) : 'bg-white text-slate-400 border-slate-200'}`}>{d}</button>)}
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-12">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
              <button onClick={handleAddActivity} className="flex-[1.5] py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-indigo-600 transition-all active:scale-95 shadow-xl shadow-indigo-100">Add Mission</button>
            </div>
          </div>
        </div>
      )}

      {/* Customize Modal */}
      {isCustomizeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[48px] p-10 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Customize AI</h3>
                <p className="text-sm text-slate-500 font-medium">Fine-tune your schedule logic</p>
              </div>
              <button onClick={() => setIsCustomizeOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"><Icon icon="solar:close-circle-outline" className="w-6 h-6" /></button>
            </div>

            <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl mb-8">
              {(['busy', 'like', 'dislike'] as const).map(tab => (
                <button key={tab} onClick={() => setCustomizeTab(tab)} className={`flex-1 py-2.5 text-[11px] font-bold rounded-xl transition-all ${customizeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {tab === 'busy' ? 'Busy Hours' : tab === 'like' ? 'Include' : 'Exclude'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-6">
              {customizeTab === 'busy' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 text-sm">Active Timeframes</h4>
                    <button onClick={() => setIsTimeframeModalOpen(true)} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                      <Icon icon="solar:add-circle-outline" className="w-3.5 h-3.5" /> New Window
                    </button>
                  </div>
                  {timeframes.length > 0 ? timeframes.map(tf => (
                    <div key={tf.id} className={`p-5 rounded-[28px] border flex items-center justify-between gap-4 transition-all ${tf.isActive ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${tf.isActive ? 'bg-amber-50 text-amber-600' : 'bg-slate-200 text-slate-400'}`}><Icon icon="solar:calendar-outline" className="w-5.5 h-5.5" /></div>
                        <div>
                          <p className="font-bold text-slate-800 text-sm leading-tight">{tf.title}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{tf.startTime} - {tf.endTime}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleTimeframe(tf.id)} className={`w-10 h-5 rounded-full relative transition-all ${tf.isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${tf.isActive ? 'right-1' : 'left-1'}`} />
                        </button>
                        <button onClick={() => deleteTimeframe(tf.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors"><Icon icon="solar:trash-bin-trash-outline" /></button>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-[32px] text-slate-400 text-xs font-medium italic">No fixed busy hours yet. Add them to block AI scheduling.</div>
                  )}
                </div>
              )}

              {customizeTab !== 'busy' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Add {customizeTab === 'like' ? 'Interest' : 'Exclusion'}</label>
                    <div className="flex gap-2">
                      <input value={prefText} onChange={e => setPrefText(e.target.value)} placeholder={customizeTab === 'like' ? "e.g. Deep Work, Afternoon Tea..." : "e.g. Early mornings, Screens at night..."} className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-300 transition-all" onKeyPress={e => e.key === 'Enter' && handleAddPreference(customizeTab as 'like' | 'dislike')} />
                      <button onClick={() => handleAddPreference(customizeTab as 'like' | 'dislike')} className={`px-5 rounded-2xl text-white transition-all shadow-lg active:scale-95 ${customizeTab === 'like' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'}`}>
                        <Icon icon="solar:add-circle-outline" className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {preferences.filter(p => p.type === customizeTab).map(pref => (
                      <div key={pref.id} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-black tracking-tight transition-all animate-in zoom-in-95 ${pref.type === 'like' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {pref.text}
                        <button onClick={() => deletePreference(pref.id)} className="hover:text-slate-900 transition-colors"><Icon icon="solar:close-circle-outline" className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    {preferences.filter(p => p.type === customizeTab).length === 0 && (
                      <div className="w-full text-center py-12 text-slate-300 text-xs italic font-medium italic">Guidance helps AI build a schedule that fits your life.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => { syncEverything(); setIsCustomizeOpen(false); }} className="mt-8 py-5 bg-indigo-600 text-white rounded-[32px] font-black text-sm tracking-widest uppercase hover:bg-indigo-700 shadow-2xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50" disabled={isSyncing}>
              {isSyncing ? 'Synchronizing intelligence...' : 'Update & Regenerate Schedule'}
            </button>
          </div>
        </div>
      )}

      {/* Timeframe Entry Modal */}
      {isTimeframeModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">Block Daily Window</h3>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Window Label</label>
                <input value={tfTitle} onChange={e => setTfTitle(e.target.value)} placeholder="e.g. Physics Class" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Starts</label>
                  <input type="time" value={tfStart} onChange={e => setTfStart(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Ends</label>
                  <input type="time" value={tfEnd} onChange={e => setTfEnd(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none" />
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-12">
              <button onClick={() => setIsTimeframeModalOpen(false)} className="flex-1 font-bold text-slate-400 hover:text-slate-600 transition-colors">Cancel</button>
              <button onClick={handleAddTimeframe} className="flex-[1.5] py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl active:scale-95 transition-all">Save Window</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modals */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Micro Wins</h3>
              <button onClick={() => setDoneItems([])} className="text-[10px] font-black uppercase text-rose-500 hover:bg-rose-50 px-3 py-1 rounded-full transition-all">Reset Log</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
              {doneItems.length > 0 ? doneItems.map(item => (
                <div key={item.id} className="flex items-center gap-5 p-5 bg-slate-50 border border-slate-100 rounded-[28px] animate-in slide-in-from-left-4 transition-all hover:border-indigo-100">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm text-2xl">
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm leading-tight">{item.text}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.timestamp}</p>
                  </div>
                  <Icon icon="solar:check-circle-bold" className="w-6 h-6 text-emerald-500" />
                </div>
              )) : (
                <div className="text-center py-24 text-slate-300 text-sm italic font-medium italic">Complete focus hacks to log your progress here.</div>
              )}
            </div>
            <button onClick={() => setIsHistoryModalOpen(false)} className={STANDARD_CLOSE_BUTTON_CLASSES}>Close Ledger</button>
          </div>
        </div>
      )}

      {isScheduleHistoryOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl flex flex-col max-h-[80vh]">
            <h3 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">Daily History</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
              {pastSchedule.length > 0 ? pastSchedule.map((item, idx) => (
                <div key={`${idx}-${item.time}`} className="flex items-center gap-5 p-5 bg-slate-50 border border-slate-100 rounded-[28px] animate-in slide-in-from-left-4 transition-all hover:border-indigo-100">
                  <div className="w-11 h-11 rounded-2xl bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                    {renderScheduleIcon(item, false, item.type.toLowerCase() === 'busy')}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm leading-tight">{item.title}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{item.time} • {item.type}</p>
                  </div>
                  <Icon icon="solar:check-circle-bold" className="w-6 h-6 text-emerald-500" />
                </div>
              )) : (
                <div className="text-center py-24 text-slate-300 text-sm italic font-medium italic">The day has just begun. Past activities will appear here.</div>
              )}
            </div>
            <button onClick={() => setIsScheduleHistoryOpen(false)} className={STANDARD_CLOSE_BUTTON_CLASSES}>Close History</button>
          </div>
        </div>
      )}
    </div>
  );
}