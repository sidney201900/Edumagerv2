import React, { useState } from 'react';
import { SchoolData, User } from '../types';
import { BookOpen, User as UserIcon, Lock, ArrowRight, Loader2, Shield } from 'lucide-react';

interface AuthProps {
  data: SchoolData;
  onLogin: (user: User) => void;
  onUpdateUsers: (newUsers: User[]) => void;
}

const Auth: React.FC<AuthProps> = ({ data, onLogin, onUpdateUsers }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    password: '',
    newPassword: '',
    cpf: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    // Simulate network delay for better UX
    await new Promise(resolve => setTimeout(resolve, 800));

    // Normalize inputs
    const loginName = (formData.name || '').trim().toLowerCase();
    const loginPass = formData.password.trim();
    const loginCpf = formData.cpf.replace(/\D/g, '');

    // Ensure data.users exists before finding
    const usersList = data.users || [];

    if (isRecovering) {
      const userIndex = usersList.findIndex(u => (u.name || '').toLowerCase() === loginName);
      const user = usersList[userIndex];
      
      if (user) {
        const storedCpf = (user.cpf || '').replace(/\D/g, '');
        
        if (!loginCpf) {
          setError('O CPF é obrigatório para recuperação.');
        } else if (storedCpf && storedCpf !== loginCpf) {
          setError('CPF incorreto para este usuário.');
        } else if (!storedCpf) {
          setError('Este usuário não possui CPF cadastrado. Entre em contato com o suporte.');
        } else if (!formData.newPassword) {
          setError('Digite a nova senha.');
        } else if (!formData.displayName) {
          setError('O Nome Completo é obrigatório.');
        } else {
          const updatedUsers = [...usersList];
          updatedUsers[userIndex] = { 
            ...updatedUsers[userIndex], 
            password: formData.newPassword.trim(),
            displayName: formData.displayName.trim()
          };
          onUpdateUsers(updatedUsers);
          setSuccess('Dados atualizados com sucesso! Faça login.');
          setIsRecovering(false);
          setFormData({ name: '', displayName: '', password: '', newPassword: '', cpf: '' });
        }
      } else {
        setError('Usuário não encontrado.');
      }
    } else {
      // Login Logic
      const user = usersList.find(u => 
        (u.name || '').toLowerCase() === loginName && 
        u.password === loginPass
      );
      
      if (user) {
        onLogin(user);
      } else {
        setError('Usuário ou senha inválidos.');
      }
    }
    
    setIsLoading(false);
  };

  const inputClass = "w-full pl-10 pr-4 py-3 bg-slate-50 text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium text-sm";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 animate-zoom-in">
        <div className="p-8 pb-6 bg-white">
          <div className="flex justify-center mb-6">
            {data.logo ? (
              <img src={data.logo} alt="Logo" className="h-28 w-auto max-w-full object-contain" />
            ) : (
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                <BookOpen size={32} />
              </div>
            )}
          </div>
          <h2 className="text-2xl font-black text-center text-slate-800 mb-1">
            {isRecovering ? 'Recuperar Senha' : 'Acesso Restrito'}
          </h2>
          <p className="text-center text-slate-500 text-sm font-medium mb-8">
            {isRecovering ? 'Crie uma nova senha para o seu usuário.' : 'Insira suas credenciais para acessar o EduManager.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative group">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Nome de Usuário" 
                required
                className={inputClass}
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>

            {isRecovering && (
              <>
                <div className="relative group">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                  <input 
                    type="text" 
                    placeholder="Nome Completo (Ex: João Silva)" 
                    required
                    className={inputClass}
                    value={formData.displayName}
                    onChange={e => setFormData({...formData, displayName: e.target.value})}
                  />
                </div>
                <div className="relative group">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                  <input 
                    type="text" 
                    placeholder="Confirme seu CPF" 
                    required
                    className={inputClass}
                    value={formData.cpf}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').slice(0, 14);
                      setFormData({...formData, cpf: val});
                    }}
                  />
                </div>
              </>
            )}

            {!isRecovering ? (
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  type="password" 
                  placeholder="Senha" 
                  required
                  className={inputClass}
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
            ) : (
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  type="password" 
                  placeholder="Nova Senha" 
                  required
                  className={inputClass}
                  value={formData.newPassword}
                  onChange={e => setFormData({...formData, newPassword: e.target.value})}
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-lg text-center animate-in fade-in">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-lg text-center animate-in fade-in">
                {success}
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  {isRecovering ? 'Redefinir Senha' : 'Entrar'}
                  {!isRecovering && <ArrowRight size={18} />}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              type="button"
              onClick={() => {
                setIsRecovering(!isRecovering);
                setError('');
                setSuccess('');
                setFormData({ name: '', displayName: '', password: '', newPassword: '', cpf: '' });
              }}
              className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {isRecovering ? 'Voltar para o Login' : 'Esqueceu a senha?'}
            </button>
          </div>
        </div>
        
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
             <p className="text-[10px] text-slate-400 uppercase font-bold">Acesso Padrão: admin / admin</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;