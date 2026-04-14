import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  CircleDollarSign, 
  Settings, 
  FileSignature,
  Award,
  Camera,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  GraduationCap,
  Shield,
  FileText,
  Cloud,
  CloudOff,
  Library,
  Briefcase,
  LogOut,
  MessageSquare,
  ClipboardList
} from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabase';
import { View, User } from '../types';

interface SidebarProps {
  currentView: View;
  setView: (view: View) => void;
  user: User | null;
  logo?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, user, logo }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const items = [
    { id: View.Dashboard, icon: LayoutDashboard, label: 'Dashboard' },
    { id: View.Courses, icon: GraduationCap, label: 'Cursos' },
    { id: View.Students, icon: Users, label: 'Alunos' },
    { id: View.Classes, icon: BookOpen, label: 'Turmas' },
    { id: View.Exams, icon: ClipboardList, label: 'Avaliações' },
    { id: View.ReportCard, icon: FileText, label: 'Boletim Escolar' },
    { id: View.Finance, icon: CircleDollarSign, label: 'Financeiro' },
    { id: View.Contracts, icon: FileSignature, label: 'Contratos' },
    { id: View.Certificates, icon: Award, label: 'Certificados' },
    { id: View.Attendance, icon: Camera, label: 'Frequência' },
    { id: View.AttendanceQuery, icon: ListChecks, label: 'Registro de Frequência' },
    { id: View.Handouts, icon: Library, label: 'Apostilas' },
    { id: View.Employees, icon: Briefcase, label: 'Funcionários' },
    { id: View.Users, icon: Shield, label: 'Usuários' },
    { id: View.Messages, icon: MessageSquare, label: 'Mensagens' },
    { id: View.Settings, icon: Settings, label: 'Configurações' },
  ];

  const toggleMobile = () => setIsMobileOpen(!isMobileOpen);
  const supabaseConfigured = isSupabaseConfigured();

  return (
    <>
      {/* Mobile Toggle */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 p-4 flex justify-between items-center z-40">
        <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
          {logo ? <img src={logo} alt="Logo" className="h-8 w-auto object-contain" /> : <BookOpen size={24} />}
          <span>EduManager</span>
        </h1>
        <button onClick={toggleMobile} className="p-2 text-slate-600">
          {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay for Mobile */}
      {isMobileOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 bg-white border-r border-slate-200 flex flex-col transition-all duration-300
        ${isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'md:w-20' : 'md:w-64'}
      `}>
        <div className={`p-6 border-b border-slate-200 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {(!isCollapsed || isMobileOpen) && (
            <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2 overflow-hidden whitespace-nowrap">
              {logo ? <img src={logo} alt="Logo" className="h-8 w-auto object-contain flex-shrink-0" /> : <BookOpen size={24} className="flex-shrink-0" />}
              <span>EduManager</span>
            </h1>
          )}
          {isCollapsed && !isMobileOpen && (logo ? <img src={logo} alt="Logo" className="h-8 w-auto object-contain" /> : <BookOpen size={24} className="text-indigo-600" />)}
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 ml-2"
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id);
                setIsMobileOpen(false);
              }}
              title={isCollapsed ? item.label : ''}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                currentView === item.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              } ${isCollapsed && !isMobileOpen ? 'justify-center px-0' : ''}`}
            >
              <item.icon size={22} className="flex-shrink-0" />
              {(!isCollapsed || isMobileOpen) && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-100 space-y-3">
          <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'px-4 py-2'}`}>
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || user.name} 
                className="w-8 h-8 rounded-full object-cover border border-slate-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                {user?.name?.substring(0, 2).toUpperCase() || 'AD'}
              </div>
            )}
            {!isCollapsed && (
              <div className="overflow-hidden flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">{user?.displayName || user?.name || 'Administrador'}</p>
                <p className="text-[10px] text-slate-500 truncate uppercase tracking-tighter">{user?.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
              </div>
            )}
            {!isCollapsed && (
              <button 
                onClick={() => window.location.reload()}
                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-all"
                title="Sair"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
          
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${supabaseConfigured ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'} ${isCollapsed ? 'justify-center px-0' : ''}`}>
            {supabaseConfigured ? <Cloud size={16} /> : <CloudOff size={16} />}
            {!isCollapsed && (
              <span className="text-[10px] font-black uppercase tracking-widest">
                {supabaseConfigured ? 'Nuvem Ativa' : 'Nuvem Inativa'}
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;