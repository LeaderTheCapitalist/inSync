
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Icon } from '@iconify/react';
import ReactMarkdown from 'react-markdown';
import { Activity, MicroActivity, ScheduleItem, Category, Priority, Difficulty, Timeframe, RepeatType } from './types';
import { geminiService } from './services/geminiService';

const CATEGORIES: Category[] = ['Study', 'Task', 'Fitness', 'Personal'];
const PRIORITIES: Priority[] = ['Urgent', 'Important', 'Normal'];
const DIFFICULTIES: Difficulty[] = ['Hard', 'Medium', 'Easy'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const REPEAT_OPTIONS: RepeatType[] = ['Today', 'Days', 'Weeks', 'Months', 'Years'];

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => {
    return (word.charAt(0).toUpperCase() + word.slice(1));
  }).join(' ');
};

VITE_GEMINI_API_KEY=YOUR_KEY_HERE

interface DoneItem {
  id: string;
  text: string;
  icon: string;
  timestamp: string;
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
  const [isTimeframeManagerOpen, setIsTimeframeManagerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const [tfAnchorType, setTfAnchorType] = useState<'Date' | 'Weekday'>('Date');
  const [tfAnchorValue, setTfAnchorValue] = useState(new Date().toISOString().split('T')[0]);
  const [tfRepeatType, setTfRepeatType] = useState<RepeatType>('Today');
  const [tfFrequency, setTfFrequency] = useState(1);
  const [tfFrom, setTfFrom] = useState(new Date().toISOString().split('T')[0]);
  const [tfTill, setTfTill] = useState('');

  useEffect(() => {
    localStorage.setItem('insync_activities', JSON.stringify(activities));
    localStorage.setItem('insync_busy', JSON.stringify(timeframes));
    localStorage.setItem('insync_schedule', JSON.stringify(schedule));
    localStorage.setItem('insync_micro', JSON.stringify(microActivities));
    localStorage.setItem('insync_done', JSON.stringify(doneItems));
    localStorage.setItem('insync_insights', JSON.stringify(insights));
  }, [activities, timeframes, schedule, microActivities, doneItems, insights]);

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
        geminiService.generateSchedule(activities, timeframes),
        geminiService.getDailyInsights(activities)
      ]);
      setSchedule(newSchedule);
      setInsights(newInsights);
    } catch (e: any) {
      setErrorMessage(e.message === 'QUOTA_EXCEEDED' ? "Daily Limit Reached." : "Sync Connection Failed.");
    } finally {
      setIsSyncing(false);
    }
  }, [activities, timeframes, isSyncing]);

  const refreshMicro = useCallback(async () => {
    if (isMicroLoading) return;
    setIsMicroLoading(true);
    try {
      const micros = await geminiService.generateMicroActivities(activities);
      setMicroActivities(micros);
    } catch (e) {} finally {
      setIsMicroLoading(false);
    }
  }, [activities, isMicroLoading]);

  useEffect(() => {
    if (schedule.length === 0) syncEverything();
    if (microActivities.length === 0) refreshMicro();
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

  const currentStatus = useMemo(() => {
    if (activities.length === 0) return { label: 'Idle', color: 'text-slate-400', bg: 'bg-slate-50' };
    const difficultyWeight = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
    const priorityWeight = { 'Normal': 1, 'Important': 2, 'Urgent': 3 };
    const totalHeat = activities.reduce((acc, curr) => {
      return acc + (difficultyWeight[curr.difficulty] || 0) + (priorityWeight[curr.priority] || 0);
    }, 0);
    if (totalHeat < 5) return { label: 'Chill', color: 'text-sky-500', bg: 'bg-sky-50' };
    if (totalHeat < 9) return { label: 'Casual', color: 'text-emerald-500', bg: 'bg-emerald-50' };
    if (totalHeat < 14) return { label: 'Normal', color: 'text-indigo-500', bg: 'bg-indigo-50' };
    if (totalHeat < 20) return { label: 'Busy', color: 'text-amber-500', bg: 'bg-amber-50' };
    return { label: 'Overloaded', color: 'text-rose-500', bg: 'bg-rose-50' };
  }, [activities]);

  const handleAddActivity = () => {
    if (!formTitle.trim()) return;
    const newAct: Activity = {
      id: Math.random().toString(36).substr(2, 9),
      title: toTitleCase(formTitle.trim()),
      category: formCategory,
      priority: formPriority,
      difficulty: formDifficulty
    };
    setActivities(prev => [...prev, newAct]);
    setFormTitle('');
    setIsModalOpen(false);
  };

  const handleAddTimeframe = () => {
    if (!tfTitle.trim()) return;
    const newTf: Timeframe = {
      id: Math.random().toString(36).substr(2, 9),
      title: toTitleCase(tfTitle.trim()),
      startTime: tfStart,
      endTime: tfEnd,
      anchorType: tfAnchorType,
      anchorValue: tfAnchorValue,
      repeatType: tfRepeatType,
      repeatFrequency: tfFrequency,
      repeatFrom: tfRepeatType !== 'Today' ? tfFrom : undefined,
      repeatTill: tfTill || undefined,
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

  const handleCompleteMicro = (micro: MicroActivity) => {
    const newItem: DoneItem = {
      id: micro.id,
      text: micro.text,
      icon: micro.icon,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setDoneItems(prev => [newItem, ...prev]);
    setMicroActivities(prev => prev.filter(m => m.id !== micro.id));
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

  const STANDARD_CLOSE_BUTTON_CLASSES = "mt-8 py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl font-bold transition-all shadow-sm active:scale-95";

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
              <p className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">AI Focus Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            <button 
              onClick={() => setIsTimeframeManagerOpen(true)}
              aria-label="Manage Busy Hours"
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all group active:scale-95 shadow-sm"
            >
              <Icon icon="solar:calendar-minimalistic-outline" className="w-4 h-4 text-slate-600 group-hover:text-indigo-600" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide hidden md:block">Busy Hours</span>
            </button>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-100 shadow-sm transition-all duration-500 ${currentStatus.bg}`}>
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${currentStatus.color.replace('text', 'bg')}`}></div>
                <span className={`text-sm font-black tracking-tight ${currentStatus.color}`}>{currentStatus.label}</span>
              </div>
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
                <p className="text-sm text-slate-500 font-medium">Define your core focus objectives</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="group flex items-center gap-2 bg-slate-900 hover:bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-xl active:scale-95"
              >
                <Icon icon="solar:add-circle-outline" className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                Add Mission
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
                        aria-label="Delete Mission"
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
          <section className="w-full bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm transition-all group relative">
            <div className="flex justify-between items-center mb-6 px-2">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Icon icon="solar:sparkles-outline" className="w-5 h-5 text-indigo-500" />
                Micro Activities
              </h2>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsHistoryModalOpen(true)} 
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold items-center gap-2 transition-all active:scale-95 opacity-0 group-hover:opacity-100 flex"
                >
                  <Icon icon="solar:checklist-minimalistic-outline" className="w-3.5 h-3.5" />
                  View History
                </button>
                <button onClick={refreshMicro} disabled={isMicroLoading} className="px-4 py-2 bg-slate-50 hover:bg-indigo-50 text-indigo-600 border border-slate-100 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                  <Icon icon="solar:refresh-outline" className={`w-3.5 h-3.5 ${isMicroLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {microActivities.length > 0 ? microActivities.map(micro => (
                <div 
                  key={micro.id} 
                  onClick={() => handleCompleteMicro(micro)}
                  className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center text-center gap-2 transition-all shadow-sm group/card cursor-pointer hover:shadow-lg hover:border-emerald-200 hover:bg-emerald-100/80 active:bg-emerald-200 animate-in zoom-in-95"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative h-10 w-10 flex items-center justify-center">
                      <div className="opacity-100 group-hover/card:opacity-0 transition-all duration-200 text-3xl">
                        {micro.icon.includes('solar:') ? <Icon icon={micro.icon} className="w-8 h-8 text-slate-600" /> : micro.icon}
                      </div>
                      <Icon icon="solar:check-circle-outline" className="absolute w-8 h-8 text-emerald-600 opacity-0 group-hover/card:opacity-100 transition-all duration-200" />
                    </div>
                    <span className="text-[10px] font-bold leading-tight text-slate-600 group-hover/card:hidden">{micro.text}</span>
                    <span className="text-[10px] font-black text-emerald-700 tracking-wide hidden group-hover/card:block">Done</span>
                  </div>
                </div>
              )) : (
                <div className="col-span-full py-6 text-center text-slate-400 text-xs italic font-medium">Sync missions to generate daily focus hacks.</div>
              )}
            </div>
          </section>

          {/* Intelligent Schedule */}
          <section className="w-full bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm transition-all">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Icon icon="solar:clock-circle-outline" className="w-5 h-5 text-indigo-500" />
                  Intelligent Schedule
                </h2>
                {errorMessage ? (
                  <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-center gap-1.5 animate-pulse">
                    <Icon icon="solar:danger-triangle-outline" className="w-3 h-3" />
                    {errorMessage}
                  </p>
                ) : currentTaskIndex !== -1 && (
                  <p className="text-[10px] font-bold text-indigo-500 mt-1 flex items-center gap-1.5">
                    <Icon icon="solar:play-circle-outline" className="w-3 h-3 animate-pulse" />
                    Focusing: {schedule[currentTaskIndex].title}
                  </p>
                )}
              </div>
              <button onClick={syncEverything} disabled={isSyncing} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:bg-slate-300">
                <Icon icon="solar:refresh-outline" className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync Flow
              </button>
            </div>
            <div ref={scrollContainerRef} className="p-8 space-y-6 max-h-[750px] overflow-y-auto custom-scrollbar scroll-smooth relative bg-slate-50/10">
              {schedule.length > 0 ? (
                <div className="relative space-y-8 before:absolute before:left-[70px] before:top-4 before:bottom-4 before:w-[2px] before:bg-slate-200">
                  {schedule.map((item, idx) => {
                    const isActive = idx === currentTaskIndex;
                    const isBusy = item.type.toLowerCase() === 'busy';
                    return (
                      <div key={idx} ref={isActive ? activeTaskRef : null} className={`flex items-center gap-8 group transition-all duration-500 ${isActive ? 'scale-[1.02] z-10 relative' : 'opacity-60 grayscale-[0.3] hover:opacity-100 hover:grayscale-0'}`}>
                        <div className="w-16 text-right flex-shrink-0">
                          <span className={`text-[11px] font-black font-mono tracking-tighter ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                            {item.time}
                          </span>
                        </div>
                        <div className={`relative z-10 w-8 h-8 rounded-xl bg-white border transition-all flex items-center justify-center flex-shrink-0 shadow-sm ${isActive ? 'border-indigo-600 ring-4 ring-indigo-50 text-indigo-600' : isBusy ? 'border-amber-200 text-amber-500 bg-amber-50' : 'border-slate-200 text-slate-400'}`}>
                           <Icon icon={item.icon.startsWith('solar:') ? item.icon : isBusy ? 'solar:forbidden-circle-outline' : 'solar:star-outline'} className="w-5 h-5" />
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
                  <input 
                    type="text" 
                    value={growthQuery}
                    onChange={(e) => setGrowthQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleGrowthQuery()}
                    placeholder="Ask focus science..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-white placeholder:text-slate-500"
                  />
                  <button onClick={handleGrowthQuery} disabled={isGrowthLoading} aria-label="Ask Growth Lab" className="absolute right-2 top-2 bottom-2 bg-indigo-600 text-white px-3 rounded-xl hover:bg-indigo-500 disabled:bg-slate-700 transition-all flex items-center justify-center">
                    <Icon icon={isGrowthLoading ? "solar:refresh-outline" : "solar:plain-2-outline"} className={`w-5 h-5 ${isGrowthLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                {growthLabResponse && (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-sm max-h-[400px] overflow-y-auto custom-scrollbar prose-custom animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-3 text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                      <Icon icon="solar:globus-outline" className="w-3 h-3" />
                      Grounded Insight
                    </div>
                    <ReactMarkdown>{growthLabResponse.text}</ReactMarkdown>
                    
                    {growthLabResponse.sources && growthLabResponse.sources.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-slate-700">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Sources</p>
                        <div className="flex flex-col gap-2">
                          {growthLabResponse.sources.map((s, idx) => (
                            <a 
                              key={idx} 
                              href={s.uri} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline flex items-center gap-1.5 transition-colors"
                            >
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
          <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl animate-in zoom-in-95" role="dialog" aria-labelledby="modal-mission-title">
            <h3 id="modal-mission-title" className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">New Mission</h3>
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
              <button onClick={() => setIsModalOpen(false)} className="flex-1 font-bold text-slate-400">Cancel</button>
              <button onClick={handleAddActivity} className="flex-[1.5] py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-indigo-600 shadow-xl shadow-slate-200 transition-all active:scale-95">Add Mission</button>
            </div>
          </div>
        </div>
      )}

      {/* Busy Hours Manager Modal */}
      {isTimeframeManagerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-[48px] p-10 shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[85vh]" role="dialog" aria-labelledby="modal-busy-title">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 id="modal-busy-title" className="text-3xl font-black text-slate-900 tracking-tighter">Busy Hours</h3>
                <p className="text-sm text-slate-500 font-medium">Manage restricted scheduling windows</p>
              </div>
              <button 
                onClick={() => setIsTimeframeModalOpen(true)}
                className="flex items-center gap-2 bg-slate-900 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-2xl font-bold transition-all shadow-lg active:scale-95"
              >
                <Icon icon="solar:add-circle-outline" className="w-5 h-5" />
                Add Timeframe
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
              {timeframes.length > 0 ? timeframes.map(tf => (
                <div key={tf.id} className={`p-5 rounded-[28px] border transition-all flex items-center justify-between gap-6 group ${tf.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${tf.isActive ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                      <Icon icon="solar:forbidden-circle-outline" className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{tf.title}</h4>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Icon icon="solar:clock-circle-outline" className="w-3 h-3" />
                        {tf.startTime} - {tf.endTime} • {tf.anchorValue} • Every {tf.repeatFrequency} {tf.repeatType}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => toggleTimeframe(tf.id)}
                      aria-label={tf.isActive ? "Deactivate" : "Activate"}
                      className={`w-12 h-6 rounded-full relative transition-all ${tf.isActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${tf.isActive ? 'right-1' : 'left-1'}`} />
                    </button>
                    <button 
                      onClick={() => deleteTimeframe(tf.id)}
                      aria-label="Delete Timeframe"
                      className="p-2 bg-slate-50 opacity-0 group-hover:opacity-100 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                    >
                      <Icon icon="solar:trash-bin-trash-outline" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="text-center py-20 bg-slate-50 border border-slate-100 rounded-[32px] text-slate-400 text-sm font-medium">No busy hours defined yet.</div>
              )}
            </div>
            <button onClick={() => setIsTimeframeManagerOpen(false)} className={STANDARD_CLOSE_BUTTON_CLASSES}>Close Manager</button>
          </div>
        </div>
      )}

      {/* Add Timeframe Modal */}
      {isTimeframeModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto custom-scrollbar" role="dialog" aria-labelledby="modal-add-tf-title">
            <h3 id="modal-add-tf-title" className="text-3xl font-black text-slate-900 mb-8 tracking-tighter">Block Timeframe</h3>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Window Label</label>
                <input value={tfTitle} onChange={e => setTfTitle(e.target.value)} placeholder="e.g. University Lectures" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Start</label>
                  <input type="time" value={tfStart} onChange={e => setTfStart(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">End</label>
                  <input type="time" value={tfEnd} onChange={e => setTfEnd(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setTfAnchorType('Date')} className={`py-3 text-[10px] font-bold rounded-2xl border transition-all ${tfAnchorType === 'Date' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border-slate-200'}`}>Specific Date</button>
                <button onClick={() => setTfAnchorType('Weekday')} className={`py-3 text-[10px] font-bold rounded-2xl border transition-all ${tfAnchorType === 'Weekday' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border-slate-200'}`}>Weekday</button>
              </div>

              {tfAnchorType === 'Date' ? (
                <input type="date" value={tfAnchorValue} onChange={e => setTfAnchorValue(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(d => (
                    <button key={d} onClick={() => setTfAnchorValue(d)} className={`px-4 py-2 text-[10px] font-bold rounded-xl border transition-all ${tfAnchorValue === d ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}>{d}</button>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 pt-6">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-4 block">Repetition</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
                  {REPEAT_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => setTfRepeatType(opt)} className={`py-2 text-[10px] font-bold rounded-xl border transition-all ${tfRepeatType === opt ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>{opt}</button>
                  ))}
                </div>

                {tfRepeatType !== 'Today' && (
                  <div className="space-y-4 animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Every</span>
                      <input 
                        type="number" 
                        value={tfFrequency} 
                        onChange={e => setTfFrequency(Math.max(1, parseInt(e.target.value) || 1))} 
                        className="bg-transparent font-bold text-indigo-600 outline-none w-12 text-center border-b border-indigo-200" 
                      />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{tfRepeatType.toLowerCase()}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Repeat From</label>
                        <input type="date" value={tfFrom} onChange={e => setTfFrom(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Repeat Till</label>
                        <input type="date" value={tfTill} onChange={e => setTfTill(e.target.value)} placeholder="Ongoing" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-4 mt-12">
              <button onClick={() => setIsTimeframeModalOpen(false)} className="flex-1 font-bold text-slate-400">Cancel</button>
              <button onClick={handleAddTimeframe} className="flex-[1.5] py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-indigo-600 shadow-xl shadow-slate-200 transition-all active:scale-95">Save Timeframe</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl flex flex-col max-h-[80vh]" role="dialog" aria-labelledby="modal-history-title">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 id="modal-history-title" className="text-3xl font-black text-slate-900 tracking-tighter">Done Today</h3>
                <p className="text-sm text-slate-500 font-medium">Log of completed micro-wins</p>
              </div>
              <button onClick={() => setDoneItems([])} aria-label="Clear History" className="text-[10px] font-bold text-rose-500 flex items-center gap-1 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors"><Icon icon="solar:trash-bin-trash-outline" /> Clear All</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
              {doneItems.length > 0 ? doneItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-5 p-4 bg-slate-50 border border-slate-100 rounded-2xl animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${idx * 50}ms` }}>
                  <span className="text-2xl">{item.icon}</span>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm">{item.text}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{item.timestamp}</p>
                  </div>
                  <Icon icon="solar:check-circle-outline" className="w-6 h-6 text-emerald-500" />
                </div>
              )) : (
                <div className="text-center py-20 bg-slate-50 border border-slate-100 rounded-[32px] text-slate-400 text-sm font-medium">No micro-activities logged today.</div>
              )}
            </div>
            <button onClick={() => setIsHistoryModalOpen(false)} className={STANDARD_CLOSE_BUTTON_CLASSES}>Close History</button>
          </div>
        </div>
      )}
    </div>
  );
}
