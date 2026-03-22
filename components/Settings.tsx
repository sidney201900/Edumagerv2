import React, { useState, useMemo } from 'react';
import { SchoolData, SchoolProfile } from '../types';
import { dbService } from '../services/dbService';
import { Download, Upload, Trash2, Database, School, Camera, FileText, Info, AlertTriangle, X, CheckCircle, AlertCircle, Cloud, HelpCircle, RefreshCw, Plus } from 'lucide-react';
import { isSupabaseConfigured, uploadLogo } from '../services/supabase';
import { useDialog } from '../DialogContext';
import imageCompression from 'browser-image-compression';

interface SettingsProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
  setData: (data: SchoolData) => void;
}

const Settings: React.FC<SettingsProps> = ({ data, updateData, setData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [selectedProfileId, setSelectedProfileId] = useState<string>(data.profile.id || 'main-school');
  const [profiles, setProfiles] = useState<SchoolProfile[]>(data.profiles || [data.profile]);
  const [globalLogo, setGlobalLogo] = useState<string>(data.logo || '');
  
  const currentProfile = profiles.find(p => p.id === selectedProfileId) || profiles[0];

  const [profileForm, setProfileForm] = useState<SchoolProfile>(currentProfile);

  const [showEvolutionModal, setShowEvolutionModal] = useState(false);
  const [evolutionForm, setEvolutionForm] = useState({
    apiUrl: data.evolutionConfig?.apiUrl || '',
    instanceName: data.evolutionConfig?.instanceName || '',
    apiKey: data.evolutionConfig?.apiKey || ''
  });

  const saveEvolutionConfig = () => {
    updateData({ evolutionConfig: evolutionForm });
    setShowEvolutionModal(false);
    showAlert('Sucesso', 'Configurações da Evolution API salvas!', 'success');
  };

  React.useEffect(() => {
    setProfileForm(currentProfile);
  }, [selectedProfileId, profiles]);

  React.useEffect(() => {
    setGlobalLogo(data.logo || '');
  }, [data.logo]);

  const [activeTab, setActiveTab] = useState<'perfil' | 'monitoramento'>('perfil');
  const [apiLogs, setApiLogs] = useState<any[]>([]);

  React.useEffect(() => {
    if (activeTab === 'monitoramento') {
      fetch('/api/logs')
        .then(res => res.json())
        .then(data => setApiLogs(data))
        .catch(err => console.error('Erro ao buscar logs:', err));
    }
  }, [activeTab]);

  const validateCNPJ = (cnpj: string) => {
    cnpj = cnpj.replace(/[^\d]+/g, '');
    if (cnpj === '' || cnpj.length !== 14) return false;
    if (/^(\d)\1+$/.test(cnpj)) return false;
    
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(1))) return false;
    
    return true;
  };

  const handleZipChange = async (zip: string) => {
    const cleanZip = zip.replace(/\D/g, '');
    setProfileForm(prev => ({ ...prev, zip: zip.replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9) }));
    
    if (cleanZip.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanZip}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setProfileForm(prev => ({
            ...prev,
            address: data.logradouro,
            city: data.localidade,
            state: data.uf
          }));
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
      }
    }
  };

  const saveProfile = () => {
    if (!validateCNPJ(profileForm.cnpj)) {
      showAlert('Erro', 'CNPJ inválido. Por favor, insira um CNPJ verdadeiro.', 'error');
      return;
    }

    // Check if trying to set as Matriz but another Matriz already exists
    if (profileForm.type === 'matriz') {
      const otherMatriz = profiles.find(p => p.type === 'matriz' && p.id !== profileForm.id);
      if (otherMatriz) {
        showAlert('Erro', `Já existe uma matriz cadastrada (${otherMatriz.name}). Só é permitida uma matriz.`, 'error');
        return;
      }
    }

    const updatedProfiles = profiles.map(p => p.id === profileForm.id ? profileForm : p);
    const mainProfile = updatedProfiles.find(p => p.type === 'matriz') || updatedProfiles[0];
    
    setProfiles(updatedProfiles);
    updateData({ profiles: updatedProfiles, profile: mainProfile });
    showAlert('Sucesso', 'Configurações salvas com sucesso!', 'success');
  };

  const addNewInstitution = () => {
    const newId = `school-${Date.now()}`;
    const newProfile: SchoolProfile = {
      id: newId,
      name: 'Nova Instituição',
      address: '',
      city: '',
      state: '',
      zip: '',
      cnpj: '',
      phone: '',
      email: '',
      type: 'filial'
    };
    setProfiles([...profiles, newProfile]);
    setSelectedProfileId(newId);
  };

  const deleteInstitution = (id: string) => {
    if (profiles.length <= 1) {
      showAlert('Erro', 'É necessário ter pelo menos uma instituição cadastrada.', 'error');
      return;
    }
    
    const profileToDelete = profiles.find(p => p.id === id);
    if (profileToDelete?.type === 'matriz') {
      showAlert('Erro', 'Não é possível excluir a instituição matriz. Altere outra para matriz primeiro.', 'error');
      return;
    }

    showConfirm(
      'Excluir Instituição?',
      `Tem certeza que deseja excluir a instituição "${profileToDelete?.name}"?`,
      () => {
        const updatedProfiles = profiles.filter(p => p.id !== id);
        setProfiles(updatedProfiles);
        setSelectedProfileId(updatedProfiles[0].id);
        updateData({ profiles: updatedProfiles, profile: updatedProfiles[0] });
      }
    );
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const supabaseConfigured = useMemo(() => isSupabaseConfigured(), []);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const downloadSupabaseSQL = () => {
    const sql = `-- Create the table for storing the entire application state as a JSON blob
create table if not exists school_data (
  id bigint primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert the initial row (id=1) if it doesn't exist so the app has something to fetch/update
insert into school_data (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- Enable Row Level Security (RLS)
alter table school_data enable row level security;

-- Create a policy that allows anyone to read/write (for development/demo purposes)
-- In a real production app, you would restrict this to authenticated users
create policy "Enable read access for all users"
on school_data for select
using (true);

create policy "Enable insert access for all users"
on school_data for insert
with check (true);

create policy "Enable update access for all users"
on school_data for update
using (true);`;

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supabase_setup.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowImportModal(false);
      setIsClosing(false);
    }, 300);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        showAlert('Aguarde', 'Fazendo upload e otimizando a logo...', 'info');
        
        // Compression options
        const options = {
          maxSizeMB: 0.1, // 100KB
          maxWidthOrHeight: 500,
          useWebWorker: true
        };

        const compressedFile = await imageCompression(file, options);
        
        let logoUrl = '';
        
        // Try to upload to Supabase if configured
        if (supabaseConfigured) {
          const url = await uploadLogo(compressedFile);
          if (url) {
            logoUrl = url;
          }
        }
        
        // Fallback to base64 if Supabase upload failed or not configured
        if (!logoUrl) {
          const reader = new FileReader();
          logoUrl = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(compressedFile);
          });
        }

        setGlobalLogo(logoUrl);
        updateData({ logo: logoUrl });
        showAlert('Sucesso', 'Logo atualizada com sucesso!', 'success');
      } catch (error) {
        console.error('Erro ao fazer upload da imagem:', error);
        showAlert('Erro', 'Falha ao processar e salvar a imagem.', 'error');
      }
    }
  };

  const handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  const formatPhone = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/, '($1) $2 ')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 16);
  };

  const handleManualSync = async () => {
    if (!supabaseConfigured) return;
    
    setIsSyncing(true);
    try {
      const cloudData = await dbService.fetchFromCloud();
      if (cloudData) {
        setData(cloudData);
        await dbService.saveData(cloudData);
        showAlert('Sucesso', '✅ Dados sincronizados com a nuvem!', 'success');
      } else {
        // If no cloud data, maybe we should push local data?
        await dbService.saveToCloud(data);
        showAlert('Sucesso', '✅ Dados locais enviados para a nuvem!', 'success');
      }
    } catch (error) {
      showAlert('Erro', '❌ Falha na sincronização. Verifique sua conexão e configurações.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-white text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm text-sm";

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <header>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Configurações</h2>
        <p className="text-slate-500 font-medium">Gerencie o perfil da escola, modelo de contrato e dados.</p>
        
        <div className="flex gap-4 mt-6 border-b border-slate-200">
          <button 
            onClick={() => setActiveTab('perfil')}
            className={`pb-2 font-bold text-sm ${activeTab === 'perfil' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Perfil
          </button>
          <button 
            onClick={() => setActiveTab('monitoramento')}
            className={`pb-2 font-bold text-sm ${activeTab === 'monitoramento' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Monitoramento de API
          </button>
        </div>
      </header>

      {activeTab === 'perfil' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-xl space-y-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 text-indigo-600">
                  <div className="p-3 bg-indigo-50 rounded-lg">
                    <School size={24} />
                  </div>
                  <h3 className="text-xl font-black text-slate-800">Perfil da Instituição</h3>
                </div>
                <button 
                  onClick={addNewInstitution}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-bold text-xs shadow-md"
                >
                  <Plus size={16} /> Nova Instituição
                </button>
              </div>

              {/* Institution Selector */}
              <div className="flex flex-wrap gap-2 mb-6">
                {profiles.map(p => (
                  <div key={p.id} className="flex items-center">
                    <button
                      onClick={() => setSelectedProfileId(p.id)}
                      className={`px-4 py-2 rounded-lg font-bold text-xs transition-all border ${
                        selectedProfileId === p.id 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {p.name} {p.type === 'matriz' && '(Matriz)'}
                    </button>
                    {p.id !== selectedProfileId && p.type !== 'matriz' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteInstitution(p.id); }}
                        className="ml-1 p-1 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-40 h-40 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative group shadow-inner">
                    {globalLogo ? (
                      <img src={globalLogo} alt="Logo" className="w-full h-full object-contain p-2" />
                    ) : (
                      <div className="text-slate-300 text-center p-4">
                        <Camera size={40} className="mx-auto mb-2 opacity-20" />
                        <span className="text-[10px] font-bold uppercase text-slate-500">Logo Global</span>
                      </div>
                    )}
                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white">
                      <Upload size={24} />
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase text-center">Logo única para todas as unidades</p>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nome da Escola</label>
                      <input className={inputClass} value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">CNPJ</label>
                      <input className={inputClass} placeholder="00.000.000/0001-00" value={profileForm.cnpj} onChange={e => setProfileForm({...profileForm, cnpj: e.target.value})} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">CEP</label>
                      <input className={inputClass} placeholder="00000-000" value={profileForm.zip} onChange={e => handleZipChange(e.target.value)} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Endereço</label>
                      <input className={inputClass} value={profileForm.address} onChange={e => setProfileForm({...profileForm, address: e.target.value})} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Cidade</label>
                      <input className={inputClass} value={profileForm.city} onChange={e => setProfileForm({...profileForm, city: e.target.value})} />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Estado (UF)</label>
                      <input className={inputClass} placeholder="UF" value={profileForm.state} onChange={e => setProfileForm({...profileForm, state: e.target.value.toUpperCase().slice(0, 2)})} />
                    </div>
                    <div className="md:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Tipo</label>
                      <select 
                        className={inputClass} 
                        value={profileForm.type} 
                        onChange={e => setProfileForm({...profileForm, type: e.target.value as 'matriz' | 'filial'})}
                      >
                        <option value="matriz">Matriz</option>
                        <option value="filial">Filial</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Telefone</label>
                      <input className={inputClass} placeholder="(00) 0 0000-0000" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: formatPhone(e.target.value)})} maxLength={16} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Email</label>
                      <input className={inputClass} placeholder="Email" value={profileForm.email} onChange={e => setProfileForm({...profileForm, email: e.target.value})} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={saveProfile}
                  className="w-full py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg font-bold text-sm"
                >
                  Salvar Perfil da Instituição
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl space-y-4">
              <div className="flex items-center gap-3 text-indigo-600">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Cloud size={20} />
                </div>
                <h3 className="text-lg font-black text-slate-800">Sincronização Nuvem</h3>
              </div>
              
              <div className={`p-4 rounded-lg border ${supabaseConfigured ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                <div className="flex items-center gap-2 font-bold text-sm mb-1">
                  {supabaseConfigured ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {supabaseConfigured ? 'Conectado ao Supabase' : 'Não Conectado'}
                </div>
                <p className="text-xs opacity-80 leading-relaxed">
                  {supabaseConfigured 
                    ? 'Seus dados estão sendo salvos automaticamente na nuvem.' 
                    : 'Para habilitar o backup na nuvem, configure as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_KEY.'}
                </p>
                {!supabaseConfigured && (
                  <div className="mt-3 text-[10px] bg-white p-2 rounded border border-slate-200 font-mono text-slate-400 break-all">
                    VITE_SUPABASE_URL=...<br/>
                    VITE_SUPABASE_KEY=...
                  </div>
                )}
              </div>

              {supabaseConfigured && (
                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700">
                  <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle size={14} /> Sincronização Automática Ativa
                  </p>
                </div>
              )}

              <button 
                onClick={downloadSupabaseSQL}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-all font-bold text-xs border border-indigo-100"
              >
                <FileText size={16} /> Baixar Script SQL Supabase
              </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl space-y-4">
              <div className="flex items-center gap-3 text-indigo-600">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Database size={20} />
                </div>
                <h3 className="text-lg font-black text-slate-800">Dados do System</h3>
              </div>
              <button onClick={async () => await dbService.exportData()} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-all font-bold text-xs">
                <Download size={16} /> Exportar Backup
              </button>
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 text-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors font-bold text-xs">
                <Upload size={16} /> Importar Backup
                <input type="file" className="hidden" accept=".json" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    showConfirm(
                      'Substituir Dados?', 
                      '⚠️ Tem certeza que deseja substituir todos os dados atuais? Esta ação não pode ser desfeita.',
                      async () => {
                        await dbService.importData(file);
                        const newData = await dbService.initData();
                        setData(newData);
                        showAlert('Sucesso', '✅ Dados restaurados com sucesso!', 'success');
                      }
                    );
                  }
                }} />
              </label>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl space-y-4">
              <div className="flex items-center gap-3 text-indigo-600">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <FileText size={20} />
                </div>
                <h3 className="text-lg font-black text-slate-800">Evolution API</h3>
              </div>
              
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                {data.evolutionConfig?.apiUrl ? (
                  <div className="space-y-2 text-sm text-slate-600">
                    <p><strong>URL:</strong> {data.evolutionConfig.apiUrl}</p>
                    <p><strong>Instância:</strong> {data.evolutionConfig.instanceName}</p>
                    <p><strong>API Key:</strong> ••••••••</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center">Nenhuma credencial configurada.</p>
                )}
              </div>

              <button 
                onClick={() => setShowEvolutionModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-bold text-xs shadow-md"
              >
                <Plus size={16} /> Configurar Credenciais
              </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl">
              <button 
                onClick={() => showConfirm(
                  'Resetar Sistema', 
                  'Isso apagará TODOS os dados cadastrados. Não há como desfazer.',
                  handleReset,
                  'alert'
                )} 
                className="w-full py-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-bold text-xs flex items-center justify-center gap-2"
              >
                <Trash2 size={16} /> Resetar Fábrica
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-xl">
          <h3 className="text-xl font-black text-slate-800 mb-6">Logs de API</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-wider">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Serviço</th>
                  <th className="px-4 py-3">Ação</th>
                  <th className="px-4 py-3">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {apiLogs.map((log, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-slate-500">{new Date(log.date).toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold text-indigo-600">{log.service}</td>
                    <td className="px-4 py-3 text-slate-700">{log.action}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs font-mono">{JSON.stringify(log.details)}</td>
                  </tr>
                ))}
                {apiLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhum log encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Evolution API Modal */}
      {showEvolutionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-800">Credenciais Evolution API</h3>
              <button 
                onClick={() => setShowEvolutionModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">URL da API</label>
                <input 
                  type="text" 
                  value={evolutionForm.apiUrl} 
                  onChange={e => setEvolutionForm({...evolutionForm, apiUrl: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm text-sm"
                  placeholder="https://api.evolution.com"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nome da Instância</label>
                <input 
                  type="text" 
                  value={evolutionForm.instanceName} 
                  onChange={e => setEvolutionForm({...evolutionForm, instanceName: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm text-sm"
                  placeholder="minha-instancia"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">API Key</label>
                <input 
                  type="password" 
                  value={evolutionForm.apiKey} 
                  onChange={e => setEvolutionForm({...evolutionForm, apiKey: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm text-sm"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <button 
                onClick={() => setShowEvolutionModal(false)}
                className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={saveEvolutionConfig}
                className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md transition-all flex items-center gap-2"
              >
                <CheckCircle size={18} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;