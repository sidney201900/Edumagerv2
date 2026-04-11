import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { View, SchoolData, User } from './types';
import { dbService } from './services/dbService';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Students from './components/Students';
import Classes from './components/Classes';
import Courses from './components/Courses';
import Finance from './components/Finance';
import Settings from './components/Settings';
import Contracts from './components/Contracts';
import Certificates from './components/Certificates';
import AttendanceCapture from './components/AttendanceCapture';
import AttendanceQuery from './components/AttendanceQuery';
import ReportCard from './components/ReportCard';
import Auth from './components/Auth';
import UserManagement from './components/UserManagement';
import Handouts from './components/Handouts';
import Employees from './components/Employees';
import Messages from './components/Messages';
import AdminNotifications from './components/AdminNotifications';
import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './services/supabase';
import { DialogProvider } from './DialogContext';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>(View.Dashboard);
  const [deepLinkStudentId, setDeepLinkStudentId] = useState<string | null>(null);
  // Initial load from LocalStorage for speed (fallback), then IDB
  const [data, setData] = useState<SchoolData>(dbService.getData());
  
  // Sync Status
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error' | 'conflict'>('idle');
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 0. Load from IndexedDB on mount
  useEffect(() => {
    const loadLocal = async () => {
      const localData = await dbService.initData();
      setData(prev => ({ ...prev, ...localData }));
    };
    loadLocal();
  }, []);

  // 1. Initial Cloud Fetch (Sync on Load)
  useEffect(() => {
    const initCloud = async () => {
      if (isSupabaseConfigured()) {
        setSyncStatus('syncing');
        const cloudData = await dbService.fetchFromCloud();
        
        if (cloudData) {
          // If cloud data exists, it takes precedence.
          setData(cloudData);
          dbService.saveData(cloudData); // Update local cache
          setSyncStatus('saved');
        } else {
          // If no cloud data, we might be starting fresh
          setSyncStatus('idle');
        }
        // Only enable cloud saving AFTER the initial fetch is attempted
        setIsCloudEnabled(true);
      }
    };
    initCloud();
  }, []);

  // 2. Save Data Effect (Local + Debounced Cloud)
  useEffect(() => {
    // Immediate Local Save
    dbService.saveData(data);

    // Debounced Cloud Save
    if (isCloudEnabled) {
      setSyncStatus('syncing');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await dbService.saveToCloud(data);
          if (result.success) {
            setSyncStatus('saved');
          } else if (result.reason === 'newer_version') {
            setSyncStatus('conflict');
          } else {
            setSyncStatus('error');
          }
        } catch (e) {
          setSyncStatus('error');
        }
      }, 2000); // Save to cloud 2 seconds after last change
    }

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [data, isCloudEnabled]);

  // 3. Dynamic Favicon
  useEffect(() => {
    const logoUrl = data.logo;
    if (logoUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = logoUrl;
    }
  }, [data.logo]);
  // 4. Efeito para Realtime (Escuta mudanças do Portal em tempo real)
  useEffect(() => {
    if (isCloudEnabled) {
      // Cria um canal de escuta para a tabela school_data
      const channel = supabase
        .channel('school_data_changes')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'school_data', filter: 'id=eq.1' },
          (payload) => {
            // Quando houver um UPDATE (ex: Portal enviou justificativa)
            const newData = payload.new.data as SchoolData;
            
            // Só atualiza se for uma mudança externa (evita loops)
            if (newData.lastUpdated !== data.lastUpdated) {
              console.log("🔔 Nova notificação recebida em tempo real!");
              setData(newData);
              dbService.saveData(newData); // Sincroniza cache local
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isCloudEnabled, data.lastUpdated]);

  const updateData = (newData: Partial<SchoolData>) => {
    setData(prev => ({ 
      ...prev, 
      ...newData,
      lastUpdated: new Date().toISOString() 
    }));
  };

  const handleUpdateUsers = (newUsers: User[]) => {
    updateData({ users: newUsers });
  };

  const forceSyncFromCloud = async () => {
    setSyncStatus('syncing');
    const cloudData = await dbService.fetchFromCloud();
    if (cloudData) {
      setData(cloudData);
      dbService.saveData(cloudData);
      setSyncStatus('saved');
    } else {
      setSyncStatus('error');
    }
  };

  const renderView = () => {
    switch (currentView) {
      case View.Dashboard:
        return <Dashboard data={data} />;
      case View.Courses:
        return <Courses data={data} updateData={updateData} />;
      case View.Students:
        return <Students data={data} updateData={updateData} />;
      case View.Classes:
        return <Classes data={data} updateData={updateData} />;
      case View.Finance:
        return <Finance data={data} updateData={updateData} />;
      case View.Contracts:
        return <Contracts data={data} updateData={updateData} />;
      case View.Certificates:
        return <Certificates data={data} updateData={updateData} />;
      case View.Attendance:
        return <AttendanceCapture data={data} updateData={updateData} />;
      case View.AttendanceQuery:
        return <AttendanceQuery data={data} updateData={updateData} deepLinkStudentId={deepLinkStudentId} clearDeepLink={() => setDeepLinkStudentId(null)} />;
      case View.ReportCard:
        return <ReportCard data={data} updateData={updateData} />;
      case View.Handouts:
        return <Handouts data={data} updateData={updateData} />;
      case View.Employees:
        return <Employees data={data} updateData={updateData} />;
      case View.Users:
        return <UserManagement data={data} updateData={updateData} />;
      case View.Messages:
        return <Messages data={data} updateData={updateData} />;
      case View.Settings:
        return <Settings data={data} updateData={updateData} setData={setData} />;
      default:
        return <Dashboard data={data} />;
    }
  };

  if (!isAuthenticated) {
    return <Auth data={data} onLogin={(user) => {
      setCurrentUser(user);
      setIsAuthenticated(true);
    }} onUpdateUsers={handleUpdateUsers} />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 relative">
      <Sidebar currentView={currentView} setView={setCurrentView} user={currentUser} logo={data.logo} />
      <main className="flex-1 w-full overflow-y-auto max-h-screen pt-16 md:pt-0 relative">
        {/* Sync Indicator - Green Strip on the Right */}
        {syncStatus === 'syncing' && (
          <div className="fixed top-6 right-0 z-[100] flex flex-col items-end pointer-events-none animate-in slide-in-from-right duration-500">
            <div className="bg-emerald-500 text-white py-2.5 px-6 shadow-2xl flex items-center gap-3 border-l-4 border-emerald-300">
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Sincronizando</span>
            </div>
            <div className="w-full h-1 bg-emerald-600/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-white/60 animate-pulse"></div>
            </div>
          </div>
        )}

        {/* Conflict Alert - Only show when there is a version mismatch */}
        {syncStatus === 'conflict' && (
          <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom duration-500">
            <button 
              onClick={forceSyncFromCloud}
              className="flex items-center gap-3 px-6 py-3 bg-amber-500 text-white rounded-2xl font-black text-xs shadow-2xl hover:bg-amber-600 transition-all active:scale-95 border-2 border-white"
            >
              <AlertCircle size={18} /> 
              <span>DADOS NOVOS NA NUVEM - CLIQUE PARA ATUALIZAR</span>
            </button>
          </div>
        )}

        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <AdminNotifications data={data} updateData={updateData} setView={setCurrentView} onNavigateToStudent={handleNavigateToStudent} />
          {renderView()}
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(
  <DialogProvider>
    <App />
  </DialogProvider>
);
