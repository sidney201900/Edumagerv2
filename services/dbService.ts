import { SchoolData } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEY = 'edumanager_db_v1';

const initialContractTemplate = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS

Pelo presente instrumento particular, de um lado {{escola}} (CNPJ: {{cnpj_escola}}), e de outro lado o(a) aluno(a) {{aluno}}, celebram o presente contrato:

1. DO OBJETO: Prestação de serviços educacionais no curso de {{curso}}.
2. DA DURAÇÃO: O curso terá a duração estimada de {{duracao}}.
3. DO INVESTIMENTO: O CONTRATANTE pagará o valor mensal de R$ {{mensalidade}}.
4. DAS OBRIGAÇÕES: A CONTRATADA disponibilizará material e instrutores qualificados.

Data: {{data}}

___________________________________________
Assinatura do Aluno / Responsável`;

const initialData: SchoolData = {
  users: [],
  courses: [],
  students: [],
  classes: [],
  payments: [],
  contracts: [],
  certificates: [],
  attendance: [],
  subjects: [],
  periods: [],
  grades: [],
  handouts: [],
  handoutDeliveries: [],
  employees: [],
  employeeCategories: [],
  lessons: [],
  notifications: [],
  profile: {
    id: 'main-school',
    name: 'EduManager School',
    address: '',
    city: '',
    state: '',
    zip: '',
    cnpj: '',
    phone: '',
    email: '',
    type: 'matriz'
  },
  logo: '',
  profiles: [
    {
      id: 'main-school',
      name: 'EduManager School',
      address: '',
      city: '',
      state: '',
      zip: '',
      cnpj: '',
      phone: '',
      email: '',
      type: 'matriz'
    }
  ],
  contractTemplates: [
    {
      id: 'default-template',
      name: 'Contrato Padrão',
      content: initialContractTemplate
    }
  ],
  lastUpdated: new Date(0).toISOString()
};

const DB_NAME = 'EduManagerDB';
const STORE_NAME = 'school_data';
const DB_VERSION = 1;

// Helper to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const dbService = {
  // Initialize and get data (Async)
  initData: async (): Promise<SchoolData> => {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(STORAGE_KEY);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const data = request.result;
          const defaultData = JSON.parse(JSON.stringify(initialData));
          
          if (!data) {
            // Fallback to localStorage migration if IDB is empty
            const localData = localStorage.getItem(STORAGE_KEY);
            if (localData) {
              try {
                const parsedLocal = JSON.parse(localData);
                resolve({ ...defaultData, ...parsedLocal });
                return;
              } catch (e) {
                // ignore
              }
            }
            resolve(defaultData);
            return;
          }

          const parsed = data; // IDB stores objects directly usually, but we might store string if migrated
          // If stored as string, parse it. If object, use it.
          const finalObj = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;

          const users = Array.isArray(finalObj.users) ? finalObj.users : [];
          const finalData = {
            ...defaultData,
            ...finalObj,
            users: users,
            profile: { ...defaultData.profile, ...(finalObj.profile || {}) },
            profiles: Array.isArray(finalObj.profiles) ? finalObj.profiles : (finalObj.profile ? [{ ...defaultData.profile, ...finalObj.profile }] : defaultData.profiles),
            logo: finalObj.logo || finalObj.profile?.logo || ''
          };

          if (finalData.users.length === 0) {
            finalData.users.push({ 
              id: 'default-admin', 
              name: 'admin', 
              displayName: 'Administrador',
              password: 'admin', 
              cpf: '000.000.000-00',
              role: 'admin'
            });
          }
          resolve(finalData);
        };
      });
    } catch (error) {
      console.error("Error loading IDB data", error);
    const fallbackData = JSON.parse(JSON.stringify(initialData));
    fallbackData.users.push({ 
      id: 'default-admin', 
      name: 'admin', 
      displayName: 'Administrador',
      password: 'admin', 
      cpf: '000.000.000-00',
      role: 'admin'
    });
    return fallbackData;
    }
  },

  // Synchronous Local Load (Deprecated/Fallback - returns initial structure immediately)
  // We keep this signature but it might return empty/default data until async load finishes
  getData: (): SchoolData => {
    // Try localStorage as a best-effort synchronous fallback for initial render
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      // ignore
    }
    return JSON.parse(JSON.stringify(initialData));
  },

  // Asynchronous Cloud Load (Supabase)
  fetchFromCloud: async (): Promise<SchoolData | null> => {
    if (!isSupabaseConfigured()) return null;

    try {
      // We assume ID 1 is the main school data row
      const { data, error } = await supabase
        .from('school_data')
        .select('data')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        console.error("Supabase fetch error:", error);
        return null;
      }

      if (data && data.data) {
        // Merge fetched data with structure to ensure backward compatibility
        const fetchedData = data.data;
        const defaultData = JSON.parse(JSON.stringify(initialData));
        
        // Ensure users exist
        if (!fetchedData.users || !Array.isArray(fetchedData.users) || fetchedData.users.length === 0) {
            fetchedData.users = defaultData.users;
            fetchedData.users.push({
                id: 'default-admin',
                name: 'admin',
                displayName: 'Administrador',
                password: 'admin',
                cpf: '000.000.000-00',
                role: 'admin'
            });
        }

        return {
           ...defaultData,
           ...fetchedData
        };
      }
      return null;
    } catch (err) {
      console.error("Cloud fetch exception:", err);
      return null;
    }
  },

  saveData: async (data: SchoolData) => {
    try {
      // Update timestamp
      data.lastUpdated = new Date().toISOString();

      // Save to IndexedDB (Async)
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(data, STORAGE_KEY);
      
      // Try to save to localStorage as backup if small enough, but don't crash if fails
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        // Quota exceeded, ignore for localStorage since we have IDB
        console.warn("LocalStorage quota exceeded, relying on IndexedDB");
      }
    } catch (e) {
      console.error("Error saving data", e);
    }
  },

  // Save to Cloud (Supabase)
  saveToCloud: async (data: SchoolData): Promise<{ success: boolean; reason?: 'newer_version' | 'error' }> => {
    if (!isSupabaseConfigured()) return { success: false, reason: 'error' };

    try {
      // 1. Fetch current cloud data to check timestamp
      const { data: cloudResult, error: fetchError } = await supabase
        .from('school_data')
        .select('data')
        .eq('id', 1)
        .maybeSingle();

      if (fetchError) {
        console.error("Error fetching for timestamp check:", fetchError);
      }

      if (cloudResult && cloudResult.data) {
        const cloudData = cloudResult.data as SchoolData;
        const cloudTimestamp = cloudData.lastUpdated ? new Date(cloudData.lastUpdated).getTime() : 0;
        const localTimestamp = data.lastUpdated ? new Date(data.lastUpdated).getTime() : 0;

        // If cloud data is strictly newer than local data, ABORT save to prevent regression
        if (cloudTimestamp > localTimestamp) {
          console.warn("Cloud data is newer than local data. Aborting save to prevent regression.");
          return { success: false, reason: 'newer_version' };
        }
      }
      
      const { error } = await supabase
        .from('school_data')
        .upsert({ 
          id: 1, 
          data: data,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return { success: true };
    } catch (e) {
      console.error("Error saving to cloud", e);
      return { success: false, reason: 'error' };
    }
  },

  exportData: async () => {
    const data = await dbService.initData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edumanager_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importData: (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          await dbService.saveData(json);
          // Trigger cloud save immediately after import
          await dbService.saveToCloud(json);
          resolve();
        } catch (err) {
          reject(new Error('Invalid backup file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
};