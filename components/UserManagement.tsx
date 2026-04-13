import React, { useState, useRef } from 'react';
import { SchoolData, User } from '../types';
import { useDialog } from '../DialogContext';
import { Plus, Edit2, Trash2, X, Shield, Lock, User as UserIcon, AlertTriangle, Camera, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { uploadProfilePicture } from '../services/supabase';

interface UserManagementProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    password: '',
    cpf: '',
    photoURL: '',
    role: 'user' as 'admin' | 'user'
  });

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosing(false);
      setEditingUser(null);
      setFormData({ name: '', displayName: '', password: '', cpf: '', photoURL: '', role: 'user' });
    }, 400);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({ 
      name: user.name, 
      displayName: user.displayName || '',
      password: user.password, 
      cpf: user.cpf || '',
      photoURL: user.photoURL || '',
      role: user.role || 'user'
    });
    setIsModalOpen(true);
  };

  const handleDelete = (user: User) => {
    if (data.users.length <= 1) {
      showAlert('Atenção', '⚠️ Você não pode excluir o último usuário do sistema.', 'warning');
      return;
    }
    
    showConfirm(
      'Remover Usuário', 
      `Tem certeza que deseja remover o acesso de ${user.name}?`,
      () => {
        const updatedUsers = data.users.filter(u => u.id !== user.id);
        updateData({ users: updatedUsers });
      }
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      
      // Compression options
      const options = {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 400,
        useWebWorker: true
      };

      const compressedFile = await imageCompression(file, options);
      
      // Upload to Supabase
      const url = await uploadProfilePicture(editingUser?.id || 'new-user', compressedFile);
      
      if (url) {
        setFormData(prev => ({ ...prev, photoURL: url }));
      } else {
        showAlert('Erro', 'Não foi possível fazer o upload da imagem. Verifique a configuração do Supabase.', 'error');
      }
    } catch (error) {
      console.error('Compression/Upload error:', error);
      showAlert('Erro', 'Erro ao processar imagem.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (formData.name.length < 3) {
      showAlert('Atenção', '⚠️ O nome deve ter no mínimo 3 caracteres.', 'warning');
      return;
    }
    if (formData.password.length < 3) {
      showAlert('Atenção', '⚠️ A senha deve ter no mínimo 3 caracteres.', 'warning');
      return;
    }
    if (!formData.cpf || formData.cpf.replace(/\D/g, '').length !== 11) {
      showAlert('Atenção', '⚠️ O CPF é obrigatório e deve ter 11 dígitos.', 'warning');
      return;
    }

    if (editingUser) {
      // Check if name is taken by another user
      const exists = data.users.some(u => (u.name || '').toLowerCase() === (formData.name || '').toLowerCase() && u.id !== editingUser.id);
      if (exists) {
        showAlert('Atenção', '⚠️ Este nome de usuário já está em uso.', 'warning');
        return;
      }

      const updatedUsers = data.users.map(u => 
        u.id === editingUser.id ? { 
          ...u, 
          name: formData.name, 
          displayName: formData.displayName,
          password: formData.password, 
          cpf: formData.cpf,
          photoURL: formData.photoURL,
          role: formData.role
        } : u
      );
      updateData({ users: updatedUsers });
    } else {
      // Check if name is taken
      const exists = data.users.some(u => (u.name || '').toLowerCase() === (formData.name || '').toLowerCase());
      if (exists) {
        showAlert('Atenção', '⚠️ Este nome de usuário já está em uso.', 'warning');
        return;
      }

      const newUser: User = {
        id: crypto.randomUUID(),
        name: formData.name,
        displayName: formData.displayName,
        password: formData.password,
        cpf: formData.cpf,
        photoURL: formData.photoURL,
        role: formData.role
      };
      updateData({ users: [...data.users, newUser] });
    }
    closeModal();
  };

  const inputClass = "w-full px-4 py-3 bg-white text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Usuários do Sistema</h2>
          <p className="text-slate-500">Gerencie quem tem acesso administrativo ao EduManager.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg font-bold"
        >
          <Plus size={20} /> Novo Usuário
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.users.map(user => (
          <div key={user.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-indigo-50 text-indigo-600 flex items-center justify-center border border-slate-100">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Shield size={24} />
                )}
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{user.displayName || user.name}</h3>
                <p className="text-xs text-slate-400 font-mono">@{user.name} • {user.role === 'admin' ? 'Admin' : 'Usuário'}</p>
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => handleEdit(user)} 
                className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all"
                title="Editar Senha/Nome"
              >
                <Edit2 size={18} />
              </button>
              <button 
                onClick={() => handleDelete(user)} 
                className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                title="Remover Acesso"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE/EDIT MODAL */}
      {isModalOpen && (
        <div className={`fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-xl w-full max-w-md shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">
                  {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
                </h3>
                <p className="text-xs text-slate-500">Defina as credenciais de acesso.</p>
              </div>
              <button onClick={closeModal} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Photo Upload */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-indigo-100 flex items-center justify-center overflow-hidden">
                    {formData.photoURL ? (
                      <img src={formData.photoURL} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon size={40} className="text-slate-300" />
                    )}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="text-white animate-spin" size={24} />
                      </div>
                    )}
                  </div>
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all"
                  >
                    <Camera size={16} />
                  </button>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handlePhotoUpload}
                />
                <p className="text-[10px] text-slate-400 mt-2 uppercase font-bold tracking-widest">Foto de Perfil</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Nome de Usuário</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      required 
                      className={`${inputClass} pl-10`}
                      placeholder="Ex: admin"
                      value={formData.name} 
                      onChange={e => setFormData({...formData, name: e.target.value})} 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      required 
                      className={`${inputClass} pl-10`}
                      placeholder="Ex: João Silva"
                      value={formData.displayName} 
                      onChange={e => setFormData({...formData, displayName: e.target.value})} 
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">CPF do Usuário</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      required 
                      className={`${inputClass} pl-10`}
                      placeholder="000.000.000-00"
                      value={formData.cpf} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').slice(0, 14);
                        setFormData({...formData, cpf: val});
                      }} 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Nível de Acesso</label>
                  <select 
                    className={inputClass}
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as 'admin' | 'user'})}
                  >
                    <option value="user">Usuário Comum</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Senha de Acesso</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    required 
                    className={`${inputClass} pl-10`}
                    placeholder="Defina a senha"
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                  />
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-bold text-sm">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg font-bold text-sm">
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;