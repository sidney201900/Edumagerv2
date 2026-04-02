import React, { useState } from 'react';
import { Bell, X, CheckCircle, Trash2 } from 'lucide-react';
import { SchoolData, Notification, View } from '../types';
import { dbService } from '../services/dbService';

interface Props {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
  setView: (view: View) => void;
}

const AdminNotifications: React.FC<Props> = ({ data, updateData, setView }) => {
  const [isOpen, setIsOpen] = useState(false);

  const adminNotifs = (data.notifications || []).filter(n => n.studentId === 'admin').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadCount = adminNotifs.filter(n => !n.read).length;

  const handleAction = (notif: Notification) => {
    if (!notif.read) handleMarkAsRead(notif.id);
    
    // Se for uma notificação de justificativa ou frequência, leva para a tela de frequência
    if (notif.title.toLowerCase().includes('justificativa') || notif.message.toLowerCase().includes('justificativa')) {
      setView(View.AttendanceQuery);
      setIsOpen(false);
    }
  };

  const handleMarkAsRead = (id: string) => {
    const updatedAll = (data.notifications || []).map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    updateData({ notifications: updatedAll });
    dbService.saveData({ ...data, notifications: updatedAll });
  };

  const handleClearAll = () => {
    const others = (data.notifications || []).filter(n => n.studentId !== 'admin');
    updateData({ notifications: others });
    dbService.saveData({ ...data, notifications: others });
  };

  return (
    <div className="fixed top-4 right-16 md:top-6 md:right-8 z-50">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="relative p-2.5 bg-white text-slate-600 rounded-full shadow-lg border border-slate-100 hover:text-indigo-600 hover:shadow-xl transition-all"
        title="Notificações do Sistema"
      >
        <Bell size={22} className={unreadCount > 0 ? "animate-pulse text-indigo-500" : ""} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-14 right-0 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-4 fade-in duration-200 flex flex-col max-h-[80vh]">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0">
            <div>
              <h3 className="font-black text-slate-800 flex items-center gap-2">Avaliações Pendentes
                {unreadCount > 0 && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{unreadCount}</span>}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleClearAll} className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-500 rounded-lg transition-colors" title="Limpar Todas">
                <Trash2 size={16} />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-2 flex-1 relative">
            {adminNotifs.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Bell size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm font-bold">Nenhuma notificação</p>
                <p className="text-xs mt-1">Sua caixa de entrada está limpa.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {adminNotifs.map(notif => (
                  <div key={notif.id} onClick={() => handleAction(notif)} className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${notif.read ? 'bg-slate-50 border-transparent opacity-70' : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm'}`}>
                    {!notif.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>}
                    <div className="flex justify-between items-start mb-1 gap-4">
                      <h4 className={`text-sm font-bold ${notif.read ? 'text-slate-600' : 'text-slate-900'}`}>{notif.title}</h4>
                      <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded">{new Date(notif.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed mb-2">{notif.message}</p>
                    {(!notif.read) && (
                      <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notif.id); }}
                          className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle size={12} /> Marcar como Lida
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
